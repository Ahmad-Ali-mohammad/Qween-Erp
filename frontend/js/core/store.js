export const store = {
  token: localStorage.getItem('accessToken') || '',
  refreshToken: localStorage.getItem('refreshToken') || '',
  user: null,
  setAuth(tokenOrPayload, refreshToken, user) {
    const payload =
      typeof tokenOrPayload === 'object' && tokenOrPayload !== null
        ? tokenOrPayload
        : { token: tokenOrPayload, refreshToken, user };

    this.token = payload.token || '';
    this.refreshToken = payload.refreshToken || '';
    this.user = payload.user || null;

    localStorage.setItem('accessToken', this.token);
    localStorage.setItem('refreshToken', this.refreshToken);
  },
  clearAuth() {
    this.token = '';
    this.refreshToken = '';
    this.user = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
};
