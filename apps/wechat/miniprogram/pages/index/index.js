const { PUBLIC_WEB_URL } = require('../../config');

Page({
  data: {
    url: PUBLIC_WEB_URL,
    failed: false
  },
  onLoad() {
    if (!/^https:\/\//.test(PUBLIC_WEB_URL)) {
      this.setData({ failed: true });
    }
  },
  onWebViewError(event) {
    console.error('web-view failed', event.detail);
    this.setData({ failed: true });
  },
  onShareAppMessage() {
    return {
      title: 'CircuitLab Physics — Explore Circuits. Understand Physics.',
      path: '/pages/index/index'
    };
  }
});
