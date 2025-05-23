/**
 * UPDATE TRACKING SCHEDULER FOR AMAZON BKTEAM EXTENSION
 * 
 * Script này sẽ tự động chạy cập nhật tracking lúc 9:15 sáng mỗi ngày khi Chrome đang chạy.
 * Đặt script này trong thư mục scripts của extension và import vào background.js
 */

// Biến lưu trữ hẹn giờ
let scheduledUpdateTrackingTask = null;

// Danh sách các domain Amazon
const UPDATE_TRACKING_DOMAINS = [
  "https://sellercentral.amazon.com",
  "https://sellercentral-europe.amazon.com",
  "https://sellercentral.amazon.de",
  "https://sellercentral.amazon.co.uk",
];

// Hàm đặt lịch tự động cập nhật tracking vào 9h15 sáng mỗi ngày
function scheduleUpdateTracking() {
  const now = new Date();
  const updateTime = new Date();
  
  // Đặt thời gian cập nhật là 9h15 sáng
  updateTime.setHours(9, 15, 0, 0);
  
  // Nếu thời gian hiện tại đã qua 9h15 sáng, đặt lịch cho ngày mai
  if (now > updateTime) {
    updateTime.setDate(updateTime.getDate() + 1);
  }
  
  // Tính toán khoảng thời gian từ hiện tại đến thời điểm cập nhật (milliseconds)
  const timeUntilUpdate = updateTime.getTime() - now.getTime();
  
  console.log(`[UPDATE TRACKING] Lịch cập nhật tracking tiếp theo: ${updateTime.toLocaleString()}`);
  console.log(`[UPDATE TRACKING] Còn: ${Math.floor(timeUntilUpdate / (1000 * 60))} phút`);
  
  // Xóa lịch trình cũ nếu có
  if (scheduledUpdateTrackingTask) {
    clearTimeout(scheduledUpdateTrackingTask);
  }
  
  // Đặt lịch mới
  scheduledUpdateTrackingTask = setTimeout(() => {
    console.log('[UPDATE TRACKING] Bắt đầu tự động cập nhật tracking lúc 9h15 sáng');
    startUpdateTracking();
    
    // Đặt lịch cho ngày hôm sau
    scheduleUpdateTracking();
  }, timeUntilUpdate);
  
  // Lưu trạng thái và thời gian cập nhật tiếp theo
  chrome.storage.local.set({ 
    'nextUpdateTrackingTime': updateTime.toISOString(),
    'autoUpdateTrackingEnabled': true
  });
}

// Hàm mở trang Amazon Orders
function openAmazonOrderPage() {
  const url = "https://sellercentral.amazon.com/orders-v3";
  
  chrome.tabs.create({ url: url, active: true }, (tab) => {
    console.log(`[UPDATE TRACKING] Mở tab mới với ID: ${tab.id}`);
    
    if (!tab || !tab.id) {
      console.error('[UPDATE TRACKING] Lỗi khi mở tab Amazon mới');
      return;
    }
    
    // Đợi tab load xong rồi mới bắt đầu cập nhật tracking
    let loadTimeout = null;
    
    function handleTabUpdate(tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        // Tab đã load xong, đợi thêm 5 giây để trang hoàn toàn ổn định
        console.log('[UPDATE TRACKING] Tab đã load xong, đợi trang ổn định...');
        
        // Xóa timeout nếu có
        if (loadTimeout) {
          clearTimeout(loadTimeout);
        }
        
        // Đợi để đảm bảo trang hoàn toàn ổn định
        setTimeout(() => {
          console.log('[UPDATE TRACKING] Gửi lệnh cập nhật tracking...');
          sendUpdateTrackingMessage(tab.id);
          
          // Xóa event listener để tránh gọi nhiều lần
          chrome.tabs.onUpdated.removeListener(handleTabUpdate);
        }, 5000);
      }
    }
    
    // Thiết lập timeout để tránh trường hợp tab không bao giờ load xong
    loadTimeout = setTimeout(() => {
      console.log('[UPDATE TRACKING] Timeout khi đợi tab load, thử gửi lệnh cập nhật...');
      sendUpdateTrackingMessage(tab.id);
      
      // Xóa event listener để tránh gọi nhiều lần
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    }, 30000); // 30 giây timeout
    
    // Lắng nghe sự kiện tab load xong
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
  });
}

// Hàm gửi thông báo để cập nhật tracking
function sendUpdateTrackingMessage(tabId) {
  // Kiểm tra xem tab còn tồn tại không
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error('[UPDATE TRACKING] Tab không còn tồn tại:', chrome.runtime.lastError);
      openAmazonOrderPage();
      return;
    }
    
    // Thử inject script để kiểm tra xem content script đã sẵn sàng chưa
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: () => {
        return {
          url: window.location.href,
          ready: typeof $ !== 'undefined' && $('.om-addon').length > 0
        };
      }
    }).then((results) => {
      const pageInfo = results?.[0]?.result;
      
      if (pageInfo && pageInfo.ready) {
        // Content script đã sẵn sàng, gửi thông báo
        console.log('[UPDATE TRACKING] Content script đã sẵn sàng, gửi lệnh cập nhật');
        
        // Gửi thông báo đến content script để bắt đầu cập nhật
        chrome.tabs.sendMessage(tabId, { 
          message: "startUpdateTrackingAuto"
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[UPDATE TRACKING] Lỗi khi gửi tin nhắn:', chrome.runtime.lastError);
            // Tự động gửi lệnh cập nhật trực tiếp đến background
            chrome.runtime.sendMessage({
              message: "runUpdateTracking",
              domain: pageInfo.url
            });
          } else if (response) {
            console.log('[UPDATE TRACKING] Phản hồi từ content script:', response);
          }
        });
      } else {
        // Content script chưa sẵn sàng, có thể cần reload trang hoặc đợi thêm
        console.log('[UPDATE TRACKING] Content script chưa sẵn sàng, thử reload trang...');
        chrome.tabs.reload(tabId, {}, () => {
          // Đợi một khoảng thời gian sau khi reload
          setTimeout(() => {
            sendUpdateTrackingMessage(tabId);
          }, 5000);
        });
      }
    }).catch(error => {
      console.error('[UPDATE TRACKING] Lỗi khi kiểm tra script:', error);
      // Có thể trang không cho phép executeScript, thử tải lại trang
      chrome.tabs.reload(tabId);
    });
  });
}

// Hàm thực hiện cập nhật tracking tự động
function startUpdateTracking() {
  console.log(`[UPDATE TRACKING] Bắt đầu quá trình cập nhật tracking tự động`);
  
  // Kiểm tra xem có đang ở trang Amazon không
  chrome.tabs.query({}, (tabs) => {
    // Tìm tab Amazon đang mở
    const amazonTab = tabs.find(tab => 
      UPDATE_TRACKING_DOMAINS.some(domain => tab.url && tab.url.includes(domain.replace("https://", "")))
    );
    
    if (amazonTab) {
      // Nếu đã có tab Amazon, kích hoạt nó
      chrome.tabs.update(amazonTab.id, {active: true});
      // Gửi lệnh cập nhật sau khi tab được kích hoạt
      setTimeout(() => {
        sendUpdateTrackingMessage(amazonTab.id);
      }, 2000);
    } else {
      // Nếu chưa có tab Amazon, mở trang orders mới
      openAmazonOrderPage();
    }
  });
}

// Thiết lập lịch tự động khi extension được tải
function initUpdateTrackingScheduler() {
  console.log('[UPDATE TRACKING] Khởi tạo update tracking scheduler');
  
  // Kiểm tra trạng thái tự động cập nhật tracking
  chrome.storage.local.get(['autoUpdateTrackingEnabled'], function(result) {
    // Mặc định bật tự động cập nhật tracking nếu chưa thiết lập
    const isEnabled = result.autoUpdateTrackingEnabled !== false;
    
    if (isEnabled) {
      scheduleUpdateTracking();
      console.log('[UPDATE TRACKING] Đã bật tự động cập nhật tracking lúc 9h15 sáng.');
    } else {
      console.log('[UPDATE TRACKING] Tự động cập nhật tracking đang bị tắt.');
    }
  });
  
  // Lắng nghe các yêu cầu lập lịch/hủy lịch
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === "toggleUpdateTracking") {
      chrome.storage.local.set({ 'autoUpdateTrackingEnabled': request.enabled });
      
      if (request.enabled) {
        scheduleUpdateTracking();
        sendResponse({ 
          success: true, 
          message: "Đã bật tự động cập nhật tracking lúc 9h15 sáng mỗi ngày" 
        });
      } else {
        if (scheduledUpdateTrackingTask) {
          clearTimeout(scheduledUpdateTrackingTask);
          scheduledUpdateTrackingTask = null;
        }
        chrome.storage.local.set({ 'nextUpdateTrackingTime': null });
        sendResponse({ 
          success: true, 
          message: "Đã tắt tự động cập nhật tracking" 
        });
      }
      return true;
    }
    
    if (request.message === "checkUpdateTrackingStatus") {
      chrome.storage.local.get(['autoUpdateTrackingEnabled', 'nextUpdateTrackingTime'], function(result) {
        const enabled = result.autoUpdateTrackingEnabled !== false;
        const nextUpdateTime = result.nextUpdateTrackingTime ? new Date(result.nextUpdateTrackingTime) : null;
        
        let nextUpdateMessage = "Chưa lập lịch";
        if (nextUpdateTime) {
          const now = new Date();
          const minutesUntilUpdate = Math.floor((nextUpdateTime - now) / (1000 * 60));
          
          if (minutesUntilUpdate > 0) {
            const hours = Math.floor(minutesUntilUpdate / 60);
            const minutes = minutesUntilUpdate % 60;
            nextUpdateMessage = `${nextUpdateTime.toLocaleString()} (còn ${hours}h ${minutes}m)`;
          } else {
            nextUpdateMessage = "Đang chuẩn bị cập nhật...";
          }
        }
        
        sendResponse({ 
          enabled: enabled,
          nextUpdate: nextUpdateMessage
        });
      });
      return true;
    }
    
    if (request.message === "runUpdateTrackingNow") {
      startUpdateTracking();
      sendResponse({ success: true, message: "Bắt đầu cập nhật tracking ngay lập tức" });
      return true;
    }
  });
}

// Export các hàm để background.js có thể sử dụng
const UpdateTrackingScheduler = {
  init: initUpdateTrackingScheduler,
  schedule: scheduleUpdateTracking,
  start: startUpdateTracking,
  openOrderPage: openAmazonOrderPage
};

// Export module để background.js có thể import
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UpdateTrackingScheduler;
} else {
  // Nếu không dùng module, thêm vào global window
  self.UpdateTrackingScheduler = UpdateTrackingScheduler;
} 