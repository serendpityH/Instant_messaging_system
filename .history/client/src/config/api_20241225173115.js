const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const WS_BASE_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';

export const api = {
  auth: {
    login: `${API_BASE_URL}/api/auth/login`,
    register: `${API_BASE_URL}/api/auth/register`,
    logout: `${API_BASE_URL}/api/auth/logout`
  },
  user: {
    current: `${API_BASE_URL}/api/users/current`,
    list: `${API_BASE_URL}/api/users`,
    update: `${API_BASE_URL}/api/users/update`,
    changePassword: `${API_BASE_URL}/api/users/change-password`
  },
  messages: `${API_BASE_URL}/api/messages`,
  ws: `${WS_BASE_URL}/ws`,
  admin: {
    users: `${API_BASE_URL}/api/admin/users`,
    logs: `${API_BASE_URL}/api/admin/logs`
  },
  groups: {
    base: `${API_BASE_URL}/api/groups`,
    my: `${API_BASE_URL}/api/groups/my`,
    available: `${API_BASE_URL}/api/groups/available`,
    join: (groupId) => `${API_BASE_URL}/api/groups/${groupId}/join`,
    members: (groupId, userId) => `${API_BASE_URL}/api/groups/${groupId}/members/${userId}`,
    pending: (groupId) => `${API_BASE_URL}/api/groups/${groupId}/pending`,
    membersList: (groupId) => `${API_BASE_URL}/api/groups/${groupId}/members`,
    leave: (groupId) => `${API_BASE_URL}/api/groups/${groupId}/leave`,
    delete: (groupId) => `${API_BASE_URL}/api/groups/${groupId}`,
    removeMember: (groupId, userId) => `${API_BASE_URL}/api/groups/${groupId}/members/${userId}`,
    messages: (groupId) => `${API_BASE_URL}/api/groups/${groupId}/messages`,
    key: (groupId) => `${API_BASE_URL}/api/groups/${groupId}/key`,
  }
}; 