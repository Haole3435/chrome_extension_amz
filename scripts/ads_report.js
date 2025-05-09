// Trong file scripts/ads_report.js

// Biến lưu trữ hẹn giờ cho ads report
let scheduledAdsReportTask = null;

// Hàm đặt lịch tự động tải báo cáo quảng cáo vào 9h45 sáng mỗi ngày
function scheduleAdsReport() {
    const now = new Date();
    const updateTime = new Date();
    
    // Đặt thời gian cập nhật là 9h45 sáng
    updateTime.setHours(9, 45, 0, 0);
    
    // Nếu thời gian hiện tại đã qua 9h45 sáng, đặt lịch cho ngày mai
    if (now > updateTime) {
        updateTime.setDate(updateTime.getDate() + 1);
    }
    
    // Tính toán khoảng thời gian từ hiện tại đến thời điểm cập nhật (milliseconds)
    const timeUntilUpdate = updateTime.getTime() - now.getTime();
    
    console.log(`[ADS REPORT] Lịch tải báo cáo quảng cáo tiếp theo: ${updateTime.toLocaleString()}`);
    console.log(`[ADS REPORT] Còn: ${Math.floor(timeUntilUpdate / (1000 * 60))} phút`);
    
    // Xóa lịch trình cũ nếu có
    if (scheduledAdsReportTask) {
        clearTimeout(scheduledAdsReportTask);
    }
    
    // Đặt lịch mới
    scheduledAdsReportTask = setTimeout(() => {
        console.log('[ADS REPORT] Bắt đầu tự động tải báo cáo quảng cáo lúc 9h45 sáng');
        // Kiểm tra xem có đang ở trang Amazon không
        chrome.tabs.query({}, (tabs) => {
            // Tìm tab Amazon đang mở
            const amazonDomains = [
                "https://sellercentral.amazon.com",
                "https://sellercentral-europe.amazon.com",
                "https://sellercentral.amazon.de",
                "https://sellercentral.amazon.co.uk",
            ];
            
            const amazonTab = tabs.find(tab => 
                amazonDomains.some(domain => tab.url && tab.url.includes(domain.replace("https://", "")))
            );
            
            if (amazonTab) {
                // Nếu đã có tab Amazon, kích hoạt nó
                chrome.tabs.update(amazonTab.id, {active: true});
                // Gửi thông báo để bắt đầu tải báo cáo quảng cáo
                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        message: "runDownloadAdsReports",
                        domain: amazonTab.url
                    });
                }, 2000);
            } else {
                // Nếu chưa có tab Amazon, mở trang Amazon mới
                chrome.tabs.create({ 
                    url: "https://sellercentral.amazon.com/orders-v3",
                    active: true 
                }, (tab) => {
                    // Đợi tab load xong
                    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                        if (tabId === tab.id && changeInfo.status === 'complete') {
                            // Tab đã load xong, đợi thêm 5 giây để trang hoàn toàn ổn định
                            setTimeout(() => {
                                chrome.runtime.sendMessage({
                                    message: "runDownloadAdsReports",
                                    domain: tab.url
                                });
                                // Xóa event listener
                                chrome.tabs.onUpdated.removeListener(listener);
                            }, 5000);
                        }
                    });
                });
            }
        });
        
        // Đặt lịch cho ngày hôm sau
        scheduleAdsReport();
    }, timeUntilUpdate);
    
    // Lưu trạng thái và thời gian cập nhật tiếp theo
    chrome.storage.local.set({ 
        'nextAdsReportTime': updateTime.toISOString(),
        'autoAdsReportEnabled': true
    });
}

// Khởi tạo lịch tải báo cáo quảng cáo khi extension được load
(function initAdsReportScheduler() {
    // Kiểm tra trạng thái tự động cập nhật từ storage
    chrome.storage.local.get(['autoAdsReportEnabled'], function(result) {
        // Mặc định bật tính năng tự động cập nhật
        const enabled = result.autoAdsReportEnabled !== false;
        
        if (enabled) {
            // Khởi tạo lịch trình
            scheduleAdsReport();
            console.log('[ADS REPORT] Đã khởi tạo lịch trình tự động tải báo cáo quảng cáo');
        } else {
            console.log('[ADS REPORT] Tự động tải báo cáo quảng cáo đã bị tắt');
        }
    });
})();

$(document).on("click", "#ads-report", function () {
    $(this).addClass("loader");
    chrome.runtime.sendMessage({
        message: "runDownloadAdsReports",
        domain: window.location.origin,
    });
});

// Lắng nghe sự kiện từ background script
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
    const { message, data } = req || {};
    
    if (message === "downloadAdsReports") {
        res({ message: "received" });
        $(".loader").removeClass("loader");
        
        const { error, successCount, reportDetails } = data || {};
        if (error) {
            notifyError(error);
            return;
        }
        
        if (successCount > 0) {
            if (reportDetails) {
                notifySuccess(`Đã tải ${successCount} báo cáo: ${reportDetails}`);
            } else {
                notifySuccess(`Đã tải ${successCount} báo cáo thành công.`);
            }
        } else {
            notifySuccess("Quá trình tải báo cáo hoàn tất. Không tìm thấy báo cáo nào để tải xuống.");
        }
    }
    
    // Xử lý khi đang tải báo cáo
    if (message === "downloadingAdsReports") {
        res({ message: "received" });
        
        // Kiểm tra jQuery đã sẵn sàng chưa
        let countCheck$ = 0;
        while (true) {
            if ((typeof jQuery !== 'undefined' && $("#ads-report").length) || countCheck$ === 30) {
                break;
            }
            await sleep(500);
            countCheck$++;
        }

        if (typeof jQuery === 'undefined') return;
        
        const { label } = data || {};
        
        // Hiển thị thông báo đang xử lý
        if (label && $(".om-addon").length) {
            taskProcessing(label);
            
            // Kích hoạt tab Ads Report
            $('[data-name="ads_report"]').click();
            
            // Thêm trạng thái loading vào nút
            $("#ads-report").addClass("loader");
        }
    }
    
    // Xử lý kiểm tra trạng thái từ popup hoặc background script
    if (message === "checkAdsReportStatus") {
        // Xử lý kiểm tra trạng thái từ popup hoặc background script
        chrome.storage.local.get(['nextAdsReportTime', 'autoAdsReportEnabled'], function(result) {
            if (res) {
                // Tính toán thời gian còn lại
                let remainingTime = "";
                let nextRun = "";
                
                if (result.nextAdsReportTime) {
                    const nextAdsReportTime = new Date(result.nextAdsReportTime);
                    const now = new Date();
                    
                    // Tính toán thời gian còn lại (phút)
                    const timeUntilUpdate = nextAdsReportTime.getTime() - now.getTime();
                    const minutesRemaining = Math.floor(timeUntilUpdate / (1000 * 60));
                    const hoursRemaining = Math.floor(minutesRemaining / 60);
                    const minsRemaining = minutesRemaining % 60;
                    
                    if (timeUntilUpdate > 0) {
                        if (hoursRemaining > 0) {
                            remainingTime = `${hoursRemaining} giờ ${minsRemaining} phút`;
                        } else {
                            remainingTime = `${minsRemaining} phút`;
                        }
                        
                        // Định dạng thời gian chạy tiếp theo (9:45 hôm nay hoặc ngày mai)
                        const isToday = nextAdsReportTime.getDate() === now.getDate() && 
                                       nextAdsReportTime.getMonth() === now.getMonth() && 
                                       nextAdsReportTime.getFullYear() === now.getFullYear();
                        
                        const timeString = nextAdsReportTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        nextRun = isToday ? `Hôm nay lúc ${timeString}` : `Ngày mai lúc ${timeString}`;
                    }
                }
                
                res({
                    enabled: result.autoAdsReportEnabled !== false,
                    nextUpdateTime: result.nextAdsReportTime,
                    remainingTime: remainingTime,
                    nextRun: nextRun
                });
            }
        });
        return true; // Giữ kênh mở cho phản hồi bất đồng bộ
    }
});