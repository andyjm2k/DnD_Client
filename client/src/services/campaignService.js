// Campaign service for handling campaign operations, chat messages and dice rolls
export const campaignService = {
  async createCampaign(data) {
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Failed to create campaign');
      return await response.json();
    } catch (error) {
      console.error('Error creating campaign:', error);
      throw error;
    }
  },
  
  async getCampaigns() {
    try {
      const response = await fetch('/api/campaigns', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return await response.json();
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      throw error;
    }
  },
  
  async getCampaign(id) {
    try {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch campaign');
      return await response.json();
    } catch (error) {
      console.error('Error fetching campaign:', error);
      throw error;
    }
  },
  
  async updateCampaign(id, data) {
    try {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Failed to update campaign');
      return await response.json();
    } catch (error) {
      console.error('Error updating campaign:', error);
      throw error;
    }
  },
  
  async deleteCampaign(id) {
    try {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Failed to delete campaign');
      return await response.json();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      throw error;
    }
  },

  async sendChatMessage(campaignId, message, type = 'dialog') {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ message, type })
      });

      if (!response.ok) throw new Error('Failed to send message');
      return await response.json();
    } catch (error) {
      console.error('Error in sendChatMessage:', error);
      throw error;
    }
  },

  async rollDice(campaignId, diceNotation, reason = '') {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/roll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ diceNotation, reason })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to roll dice');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error in rollDice:', error);
      throw error;
    }
  }
}; 