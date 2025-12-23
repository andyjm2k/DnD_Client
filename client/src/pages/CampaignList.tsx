import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Campaign } from '../types/campaign';
import { campaignService } from '../services/campaignService';

const CampaignList: React.FC = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      const data = await campaignService.getCampaigns();
      setCampaigns(data);
    } catch (err) {
      console.error('Error loading campaigns:', err);
      setError('Failed to load campaigns. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Handle campaign deletion with confirmation
  const handleDeleteCampaign = async (e: React.MouseEvent, campaignId: string, campaignTitle: string) => {
    // Stop event propagation to prevent navigation when clicking delete button
    e.stopPropagation();
    
    // Confirm deletion with user
    if (!window.confirm(`Are you sure you want to delete "${campaignTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Delete the campaign
      await campaignService.deleteCampaign(campaignId);
      
      // Reload the campaigns list to reflect the deletion
      await loadCampaigns();
    } catch (err) {
      console.error('Error deleting campaign:', err);
      setError('Failed to delete campaign. Please try again later.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <button
          onClick={() => loadCampaigns()}
          className="bg-indigo-500 text-white px-6 py-3 rounded-lg hover:bg-indigo-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold mb-4">No Campaigns Yet</h2>
        <p className="text-gray-600 mb-8">Create your first campaign to begin your adventure!</p>
        <Link
          to="/campaigns/create"
          className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Create Campaign
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Campaigns</h1>
        <Link
          to="/campaigns/create"
          className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Create Campaign
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="bg-white rounded-lg shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-shadow relative"
            onClick={() => navigate(`/campaigns/${campaign.id}`)}
          >
            <div className="bg-indigo-600 text-white px-4 py-2 flex justify-between items-center">
              <h2 className="text-xl font-semibold truncate flex-1">{campaign.title}</h2>
              <button
                onClick={(e) => handleDeleteCampaign(e, campaign.id, campaign.title)}
                className="ml-2 text-white hover:text-red-200 transition-colors p-1 rounded"
                title="Delete campaign"
                aria-label={`Delete ${campaign.title}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <div className="text-sm text-gray-500 mb-2">
                <span className="mr-4">Setting: {campaign.setting}</span>
                <span>Tone: {campaign.tone}</span>
              </div>
              <p className="text-gray-700 line-clamp-3 mb-4">{campaign.description}</p>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">
                  Created: {new Date(campaign.createdAt).toLocaleDateString()}
                </span>
                <span className={`px-2 py-1 rounded ${
                  campaign.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : campaign.status === 'paused'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CampaignList; 