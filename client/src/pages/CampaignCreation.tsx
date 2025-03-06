import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Character } from '../types/character';
import { campaignService, CreateCampaignData, AIDMSettings } from '../services/campaignService';
import { characterService } from '../services/characterService';

const CampaignCreation: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [formData, setFormData] = useState<CreateCampaignData>({
    title: '',
    setting: '',
    tone: '',
    description: '',
    characterId: '',
    aiDmSettings: {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      personality: 'Friendly and encouraging',
      style: 'Descriptive and engaging',
      difficulty: 'medium'
    }
  });

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      const data = await characterService.getCharacters();
      setCharacters(data);
      if (data.length > 0) {
        setFormData(prev => ({ ...prev, characterId: data[0].id }));
      }
    } catch (err) {
      console.error('Error loading characters:', err);
      setError('Failed to load characters. Please try again later.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const campaign = await campaignService.createCampaign(formData);
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      console.error('Error creating campaign:', err);
      setError('Failed to create campaign. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      if (parent === 'aiDmSettings' && child in formData.aiDmSettings) {
        const newValue = child === 'temperature' ? parseFloat(value) : value;
        setFormData(prev => ({
          ...prev,
          aiDmSettings: {
            ...prev.aiDmSettings,
            [child]: newValue
          } as AIDMSettings
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  if (characters.length === 0) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold mb-4">Create a Character First</h2>
        <p className="text-gray-600 mb-8">You need at least one character to create a campaign.</p>
        <button
          onClick={() => navigate('/characters/create')}
          className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Create Character
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create New Campaign</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Campaign Information */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Campaign Title</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="The Lost Mines of Phandelver"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Setting</label>
              <input
                type="text"
                name="setting"
                value={formData.setting}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Sword Coast, Forgotten Realms"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Tone</label>
              <input
                type="text"
                name="tone"
                value={formData.tone}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Heroic fantasy with elements of mystery"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Character</label>
              <select
                name="characterId"
                value={formData.characterId}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                {characters.map(char => (
                  <option key={char.id} value={char.id}>
                    {char.name} - Level {char.level} {char.race} {char.class}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* AI DM Settings */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">AI Model</label>
              <select
                name="aiDmSettings.model"
                value={formData.aiDmSettings.model}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="gpt-4">GPT-4</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">DM Personality</label>
              <input
                type="text"
                name="aiDmSettings.personality"
                value={formData.aiDmSettings.personality}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Friendly and encouraging"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Narrative Style</label>
              <input
                type="text"
                name="aiDmSettings.style"
                value={formData.aiDmSettings.style}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Descriptive and engaging"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Difficulty</label>
              <select
                name="aiDmSettings.difficulty"
                value={formData.aiDmSettings.difficulty}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
        </div>

        {/* Campaign Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Campaign Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            required
            rows={4}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="Describe your campaign's premise and goals..."
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating Campaign...' : 'Create Campaign'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CampaignCreation; 