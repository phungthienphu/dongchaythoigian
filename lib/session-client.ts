export const SESSION_ENDED_EVENT = 'game-session-ended';
export const SESSION_ENDED_MESSAGE = 'Phiên chơi đã hết hiệu lực hoặc tài khoản vừa đăng nhập trên máy khác. Hãy đăng nhập lại để tiếp tục.';
export function sessionEnded() {
  window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
}
