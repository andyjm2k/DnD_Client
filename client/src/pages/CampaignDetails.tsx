import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Campaign, ChatMessage } from '../types/campaign';
import { campaignService } from '../services/campaignService';

// Dice presets for quick rolling
const DICE_PRESETS = [
  { label: 'd20', notation: 'd20' },
  { label: 'd12', notation: 'd12' },
  { label: 'd10', notation: 'd10' },
  { label: 'd8', notation: 'd8' },
  { label: 'd6', notation: 'd6' },
  { label: 'd4', notation: 'd4' },
  { label: '2d6', notation: '2d6' },
  { label: '3d6', notation: '3d6' }
];

const CampaignDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [playerMessage, setPlayerMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [gameLog, setGameLog] = useState<ChatMessage[]>([]);
  
  // Dice roller states
  const [showDiceRoller, setShowDiceRoller] = useState(false);
  const [customDice, setCustomDice] = useState('');
  const [diceReason, setDiceReason] = useState('');
  const [rollingDice, setRollingDice] = useState(false);

  const loadCampaign = useCallback(async () => {
    if (!id) return;
    
    try {
      const data = await campaignService.getCampaign(id);
      setCampaign(data);
      
      // Set the game log from chat history
      if (data.chatHistory && data.chatHistory.length > 0) {
        setGameLog(data.chatHistory.sort((a: { timestamp: string }, b: { timestamp: string }) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        ));
      }
    } catch (err) {
      console.error('Error loading campaign:', err);
      setError('Failed to load campaign. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCampaign();
  }, [id, loadCampaign]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!playerMessage.trim() || !campaign || !id) return;
    
    try {
      setSendingMessage(true);
      
      // Send the message to the server
      const responseMessages = await campaignService.sendChatMessage(id, playerMessage);
      
      // Update the game log with the new messages
      setGameLog(prevLog => [...prevLog, ...responseMessages]);
      
      // Clear the input
      setPlayerMessage('');
      
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleGameAction = async (actionType: string) => {
    if (!campaign || !id) return;
    
    try {
      setSendingMessage(true);
      
      // Define the action based on type
      let action = {
        type: actionType,
        description: ''
      };
      
      // Customize action based on type
      switch (actionType) {
        case 'skill_check':
          const skill = prompt('Which skill would you like to check?');
          const description = prompt('Describe what you are trying to do:');
          if (!skill || !description) {
            setSendingMessage(false);
            return;
          }
          action.description = `I want to make a ${skill} check: ${description}`;
          break;
          
        case 'combat_action':
          const combatAction = prompt('Describe your combat action:');
          if (!combatAction) {
            setSendingMessage(false);
            return;
          }
          action.description = combatAction;
          break;
          
        case 'spell':
          const spell = prompt('Which spell do you want to cast?');
          const target = prompt('Target or area of effect:');
          if (!spell) {
            setSendingMessage(false);
            return;
          }
          action.description = `I cast ${spell}${target ? ` targeting ${target}` : ''}`;
          break;
          
        case 'investigate':
          const investigateTarget = prompt('What do you want to investigate?');
          if (!investigateTarget) {
            setSendingMessage(false);
            return;
          }
          action.description = `I investigate ${investigateTarget}`;
          break;
          
        default:
          const actionDescription = prompt('Describe your action:');
          if (!actionDescription) {
            setSendingMessage(false);
            return;
          }
          action.description = actionDescription;
      }
      
      console.log('Sending action request:', {
        action,
        context: {
          characterId: campaign.characterId
        }
      });
      
      // Send the action to the server
      const response = await fetch(`/api/campaigns/${id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          action,
          context: {
            characterId: campaign.characterId
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Server error response:', errorData);
        if (errorData && errorData.error) {
          throw new Error(`Server error: ${errorData.error}`);
        } else {
          throw new Error(`Failed to perform action: ${response.status} ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      console.log('Server response:', data);
      
      // Update the game log with the new messages
      const newMessages = [data.playerMessage, data.dmResponse] as ChatMessage[];
      setGameLog(prevLog => [...prevLog, ...newMessages]);
      
      // Reload the campaign to get the updated state
      loadCampaign();
    } catch (err) {
      console.error('Error performing action:', err);
      setError(err instanceof Error ? err.message : 'Failed to perform action. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Handle dice rolling
  const handleRollDice = async (notation: string) => {
    if (!campaign || !id) return;
    
    try {
      setRollingDice(true);
      
      // Call the dice roll API
      const result = await campaignService.rollDice(id, notation, diceReason);
      
      // Add the roll result to the game log
      setGameLog(prevLog => [...prevLog, result.chatMessage]);
      
      // Clear the custom input and reason after rolling
      setCustomDice('');
      setDiceReason('');
      
    } catch (err) {
      console.error('Error rolling dice:', err);
      setError(err instanceof Error ? err.message : 'Failed to roll dice. Please try again.');
    } finally {
      setRollingDice(false);
    }
  };

  const handleCustomDiceRoll = (e: React.FormEvent) => {
    e.preventDefault();
    if (customDice.trim()) {
      handleRollDice(customDice);
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
          onClick={() => navigate('/campaigns')}
          className="bg-indigo-500 text-white px-6 py-3 rounded-lg hover:bg-indigo-600 transition-colors"
        >
          Back to Campaigns
        </button>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold mb-4">Campaign Not Found</h2>
        <p className="text-gray-600 mb-8">The campaign you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate('/campaigns')}
          className="bg-indigo-500 text-white px-6 py-3 rounded-lg hover:bg-indigo-600 transition-colors"
        >
          Back to Campaigns
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        {/* Campaign Header */}
        <div className="bg-indigo-600 text-white px-6 py-4">
          <h1 className="text-3xl font-bold">{campaign.title}</h1>
          <div className="mt-2 text-indigo-100">
            <span className="mr-4">Setting: {campaign.setting}</span>
            <span>Tone: {campaign.tone}</span>
          </div>
        </div>

        {/* Campaign Content */}
        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <h2 className="text-xl font-semibold mb-2">Description</h2>
            <p className="text-gray-700">{campaign.description}</p>
          </div>

          {/* Current Location */}
          <div>
            <h2 className="text-xl font-semibold mb-2">Current Location</h2>
            <h3 className="text-lg font-medium text-indigo-600">{campaign.currentLocation}</h3>
            <p className="text-gray-700 mt-1">{campaign.locationDesc}</p>
          </div>

          {/* Current Quest */}
          <div>
            <h2 className="text-xl font-semibold mb-2">Current Quest</h2>
            <h3 className="text-lg font-medium text-indigo-600">{campaign.currentQuest}</h3>
            <p className="text-gray-700 mt-1">{campaign.questDesc}</p>
          </div>

          {/* Objectives */}
          <div>
            <h2 className="text-xl font-semibold mb-2">Objectives</h2>
            <p className="text-gray-700">{campaign.objectives}</p>
          </div>

          {/* NPCs */}
          <div>
            <h2 className="text-xl font-semibold mb-2">NPCs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaign.npcs.map((npc) => (
                <div key={npc.id} className="border rounded-lg p-4">
                  <h3 className="font-medium text-indigo-600">{npc.name}</h3>
                  <p className="text-sm text-gray-500">{npc.role} - {npc.location}</p>
                  <p className="text-gray-700 mt-1">{npc.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Game Actions */}
          <div>
            <h2 className="text-xl font-semibold mb-2">Game Actions</h2>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => handleGameAction('skill_check')}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                disabled={sendingMessage}
              >
                Skill Check
              </button>
              <button 
                onClick={() => handleGameAction('combat_action')}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                disabled={sendingMessage}
              >
                Combat Action
              </button>
              <button 
                onClick={() => handleGameAction('spell')}
                className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
                disabled={sendingMessage}
              >
                Cast Spell
              </button>
              <button 
                onClick={() => handleGameAction('investigate')}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                disabled={sendingMessage}
              >
                Investigate
              </button>
              <button 
                onClick={() => handleGameAction('action')}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                disabled={sendingMessage}
              >
                Custom Action
              </button>
              <button 
                onClick={() => setShowDiceRoller(!showDiceRoller)}
                className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
                disabled={sendingMessage}
              >
                {showDiceRoller ? 'Hide Dice Roller' : 'Show Dice Roller'}
              </button>
            </div>
          </div>

          {/* Dice Roller */}
          {showDiceRoller && (
            <div className="bg-gray-100 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Dice Roller</h3>
              
              {/* Dice presets */}
              <div className="mb-3">
                <p className="text-sm mb-1">Quick Roll:</p>
                <div className="flex flex-wrap gap-2">
                  {DICE_PRESETS.map((dice, index) => (
                    <button
                      key={index}
                      onClick={() => handleRollDice(dice.notation)}
                      className="bg-indigo-500 text-white px-3 py-1 rounded text-sm hover:bg-indigo-600"
                      disabled={rollingDice}
                    >
                      {dice.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Custom dice form */}
              <form onSubmit={handleCustomDiceRoll} className="space-y-2">
                <div>
                  <label htmlFor="customDice" className="block text-sm mb-1">
                    Custom Roll (e.g., d20, 2d6, d8+3):
                  </label>
                  <input
                    id="customDice"
                    type="text"
                    value={customDice}
                    onChange={(e) => setCustomDice(e.target.value)}
                    placeholder="Enter dice notation"
                    className="w-full px-3 py-2 border rounded"
                    disabled={rollingDice}
                  />
                </div>
                <div>
                  <label htmlFor="diceReason" className="block text-sm mb-1">
                    Reason (optional):
                  </label>
                  <input
                    id="diceReason"
                    type="text"
                    value={diceReason}
                    onChange={(e) => setDiceReason(e.target.value)}
                    placeholder="E.g., Stealth Check, Attack Roll"
                    className="w-full px-3 py-2 border rounded"
                    disabled={rollingDice}
                  />
                </div>
                <button
                  type="submit"
                  className="bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600"
                  disabled={rollingDice || !customDice.trim()}
                >
                  {rollingDice ? 'Rolling...' : 'Roll Dice'}
                </button>
              </form>
            </div>
          )}

          {/* Chat History */}
          <div>
            <h2 className="text-xl font-semibold mb-2">Game Log</h2>
            <div className="space-y-4 max-h-80 overflow-y-auto p-4 border rounded-lg bg-gray-50">
              {gameLog.map((message, index) => (
                <div
                  key={message.id || index}
                  className={`p-4 rounded-lg ${
                    message.speaker === 'dm'
                      ? 'bg-indigo-50'
                      : message.speaker === 'system'
                      ? 'bg-gray-50'
                      : 'bg-green-50'
                  }`}
                >
                  <div className="font-medium text-gray-900 mb-1">
                    {message.speaker === 'dm' ? 'Dungeon Master' : message.speaker === 'system' ? 'System' : 'Player'}
                  </div>
                  <p className="text-gray-700">{message.message}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Input */}
          <div>
            <form onSubmit={handleSendMessage} className="mt-4">
              <div className="flex">
                <input
                  type="text"
                  value={playerMessage}
                  onChange={(e) => setPlayerMessage(e.target.value)}
                  placeholder="What do you want to do or say?"
                  className="flex-grow border rounded-l px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={sendingMessage}
                />
                <button
                  type="submit"
                  className="bg-indigo-500 text-white px-4 py-2 rounded-r hover:bg-indigo-600 transition-colors"
                  disabled={sendingMessage}
                >
                  {sendingMessage ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignDetails; 