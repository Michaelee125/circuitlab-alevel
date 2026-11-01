// CircuitLab Physics — WeChat shell.
// Phase 2 scaffold only. The physics, reasoning and teaching engines are shared
// from packages/* and are not duplicated here.
App({
  globalData: {
    platform: 'wechat',
    version: '0.1.0'
  },
  onLaunch() {
    // Business-domain registration is required before a web-view may load the
    // production URL. See docs/wechat-mini-program.md.
    if (wx.getUpdateManager) {
      const updateManager = wx.getUpdateManager();
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: 'Update ready',
          content: 'Restart to load the new version.',
          success: (res) => {
            if (res.confirm) updateManager.applyUpdate();
          }
        });
      });
    }
  }
});
