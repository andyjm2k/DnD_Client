import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Campaign, ChatMessage, CampaignTextLogEntry, QuestLogEntry } from '../types/campaign';
import { Character } from '../types/character';
import { campaignService } from '../services/campaignService';
import { characterService } from '../services/characterService';
import CharacterSheetPanel from '../components/character/CharacterSheetPanel';
import GameActionsPanel from '../components/campaign/GameActionsPanel';

const parseJsonLog = <T,>(value?: string | null): T[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const parseObjectives = (objectives: string | null | undefined) => {
  if (!objectives) {
    return [];
  }

  return objectives
    .split('\n')
    .map((entry) => entry.replace(/^[\s-*•]+/, '').trim())
    .filter(Boolean);
};

// Helper function to decode HTML entities in portrait URLs
const decodeHtmlEntities = (str: string): string => {
  try {
    // Create a temporary textarea element to decode HTML entities
    // This handles entities like &#x2F; (/) and &amp; (&)
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
  } catch (error) {
    // Fallback: manually replace common HTML entities if DOM method fails
    console.warn('Failed to decode HTML entities using DOM method, using fallback:', error);
    return str
      .replace(/&#x2F;/g, '/')
      .replace(/&#x2f;/g, '/')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
};

// Check if a string is likely base64 encoded
const isLikelyBase64 = (value: string) => /^[A-Za-z0-9+/=]+$/.test(value);

// Normalize portrait URL by decoding HTML entities and validating format
const normalizePortrait = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  // Decode HTML entities first (e.g., &#x2F; becomes /)
  const decoded = decodeHtmlEntities(value);
  const trimmed = decoded.trim();
  
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }

  // Check if it's already a valid data URL, blob URL, HTTP URL, or relative path
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    /^https?:\/\//.test(trimmed) ||
    /^\/(?!\/)/.test(trimmed)
  ) {
    return trimmed;
  }

  // If it looks like base64, prepend the data URL prefix
  if (isLikelyBase64(trimmed)) {
    return `data:image/png;base64,${trimmed}`;
  }

  return null;
};

// Helper function to transform server character data to client Character format
const transformCharacter = (serverChar: any): Character => {
  const calculateModifier = (score: number): number => {
    return Math.floor((score - 10) / 2);
  };

  const strength = serverChar.strength ?? 10;
  const dexterity = serverChar.dexterity ?? 10;
  const constitution = serverChar.constitution ?? 10;
  const intelligence = serverChar.intelligence ?? 10;
  const wisdom = serverChar.wisdom ?? 10;
  const charisma = serverChar.charisma ?? 10;

  return {
    id: serverChar.id,
    name: serverChar.name,
    portrait: normalizePortrait(serverChar.portrait),
    race: serverChar.race,
    class: serverChar.class,
    level: serverChar.level || 1,
    background: serverChar.background || '',
    alignment: serverChar.alignment || 'True Neutral',
    experience: serverChar.experience || 0,
    abilities: {
      strength: { score: strength, modifier: calculateModifier(strength) },
      dexterity: { score: dexterity, modifier: calculateModifier(dexterity) },
      constitution: { score: constitution, modifier: calculateModifier(constitution) },
      intelligence: { score: intelligence, modifier: calculateModifier(intelligence) },
      wisdom: { score: wisdom, modifier: calculateModifier(wisdom) },
      charisma: { score: charisma, modifier: calculateModifier(charisma) },
    },
    hitPoints: {
      maximum: serverChar.maxHitPoints || 10,
      current: serverChar.currentHitPoints || 10,
    },
    armorClass: serverChar.armorClass || 10,
    speed: serverChar.speed || 30,
    proficiencyBonus: Math.ceil((serverChar.level || 1) / 4) + 1,
    backstory: serverChar.backstory || '',
    status: serverChar.status || 'alive',
    deathSavingThrowSuccesses: serverChar.deathSavingThrowSuccesses || 0,
    deathSavingThrowFailures: serverChar.deathSavingThrowFailures || 0,
    equipment: serverChar.equipment?.map((eq: any) => ({
      id: eq.id,
      item: eq.item,
      quantity: eq.quantity,
      equipped: eq.equipped || false
    })) || [],
    proficiencies: serverChar.proficiencies || [],
  };
};

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
  
  // Collapse state for sections between Description and Game Actions
  const [isSectionsCollapsed, setIsSectionsCollapsed] = useState(false);
  
  // Character sheet panel state
  const [isCharacterSheetOpen, setIsCharacterSheetOpen] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  
  // Game Actions panel state
  const [isGameActionsOpen, setIsGameActionsOpen] = useState(false);
  
  // Ref for Game Log auto-scroll
  const gameLogRef = useRef<HTMLDivElement>(null);

  const loadCampaign = useCallback(async () => {
    if (!id) return;
    
    try {
      const data = await campaignService.getCampaign(id);
      setCampaign(data);
      
      // Transform and set character data if available
      if (data.character) {
        const transformedCharacter = transformCharacter(data.character);
        setCharacter(transformedCharacter);
      } else if (data.characterId) {
        // If character is not included, fetch it separately
        try {
          const charData = await characterService.getCharacter(data.characterId);
          setCharacter(charData);
        } catch (err) {
          console.error('Error loading character:', err);
        }
      }
      
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

  // Auto-scroll Game Log to bottom when new messages are added
  useEffect(() => {
    if (gameLogRef.current) {
      // Check if user is near the bottom (within 50px) before auto-scrolling
      const container = gameLogRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      
      // Only auto-scroll if user is near the bottom
      if (isNearBottom) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          if (gameLogRef.current) {
            gameLogRef.current.scrollTop = gameLogRef.current.scrollHeight;
          }
        }, 0);
      }
    }
  }, [gameLog]);

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

      // Reload campaign details to reflect any new quest/objective/loot updates
      loadCampaign();
      
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
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
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
      const newMessages: ChatMessage[] = [result.chatMessage];
      
      // If DM response is available, add it to the game log as well
      if (result.dmResponse) {
        newMessages.push(result.dmResponse);
      }
      
      setGameLog(prevLog => [...prevLog, ...newMessages]);
      
      // Clear the custom input and reason after rolling
      setCustomDice('');
      setDiceReason('');
      
      // Reload campaign details to reflect any updates from DM response
      loadCampaign();
      
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

  const questLog = parseJsonLog<QuestLogEntry>(campaign.questLog);
  const objectiveLog = parseJsonLog<CampaignTextLogEntry>(campaign.objectiveLog);
  const lootLog = parseJsonLog<CampaignTextLogEntry>(campaign.lootLog);
  const currentObjectives = parseObjectives(campaign.objectives);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        {/* Campaign Header */}
        <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsGameActionsOpen(!isGameActionsOpen)}
              className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              title="Toggle Game Actions"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              <span>Game Actions</span>
            </button>
            <div>
              <h1 className="text-3xl font-bold">{campaign.title}</h1>
              <div className="mt-2 text-indigo-100">
                <span className="mr-4">Setting: {campaign.setting}</span>
                <span>Tone: {campaign.tone}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsCharacterSheetOpen(!isCharacterSheetOpen)}
            className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
            title="Toggle Character Sheet"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>Character Sheet</span>
          </button>
        </div>

        {/* Campaign Content */}
        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold">Description</h2>
              <button
                onClick={() => setIsSectionsCollapsed(!isSectionsCollapsed)}
                className="text-sm text-indigo-600 hover:text-indigo-800 underline"
              >
                {isSectionsCollapsed ? 'Expand All' : 'Collapse All'}
              </button>
            </div>
            <p className="text-gray-700">{campaign.description}</p>
          </div>

          {/* Collapsible sections between Description and Game Actions */}
          {!isSectionsCollapsed && (
            <>
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
                {currentObjectives.length > 0 ? (
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    {currentObjectives.map((objective, index) => (
                      <li key={`${objective}-${index}`}>{objective}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">No objectives tracked yet.</p>
                )}
              </div>

              {/* Quest Log */}
              <div>
                <h2 className="text-xl font-semibold mb-2">Quest Log</h2>
                {questLog.length > 0 ? (
                  <div className="space-y-3">
                    {questLog.map((entry, index) => (
                      <div key={`${entry.title}-${index}`} className="border rounded-lg p-3">
                        <h3 className="font-medium text-indigo-600">{entry.title}</h3>
                        {entry.description && (
                          <p className="text-gray-700 mt-1">{entry.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No quests recorded yet.</p>
                )}
              </div>

              {/* Objective History */}
              <div>
                <h2 className="text-xl font-semibold mb-2">Objective History</h2>
                {objectiveLog.length > 0 ? (
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    {objectiveLog.map((entry, index) => (
                      <li key={`${entry.text}-${index}`}>{entry.text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">No objective history yet.</p>
                )}
              </div>

              {/* Loot Log */}
              <div>
                <h2 className="text-xl font-semibold mb-2">Loot Log</h2>
                {lootLog.length > 0 ? (
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    {lootLog.map((entry, index) => (
                      <li key={`${entry.text}-${index}`}>{entry.text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">No loot tracked yet.</p>
                )}
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
            </>
          )}

          {/* Chat History */}
          <div>
            <h2 className="text-xl font-semibold mb-2">Game Log</h2>
            <div 
              ref={gameLogRef}
              className="space-y-4 max-h-[calc(100vh-400px)] overflow-y-auto p-4 border rounded-lg bg-gray-50"
            >
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
            {(campaign.status === 'completed' || character?.status === 'deceased') ? (
              <div className="mt-4 p-4 bg-red-100 border-2 border-red-500 rounded-lg">
                <p className="text-red-700 font-semibold">
                  {character?.status === 'deceased' 
                    ? 'Your character has died. This campaign has ended.' 
                    : 'This campaign has been completed.'}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="mt-4">
                <div className="flex">
                  <input
                    type="text"
                    value={playerMessage}
                    onChange={(e) => setPlayerMessage(e.target.value)}
                    placeholder="What do you want to do or say?"
                    className="flex-grow border rounded-l px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={sendingMessage || character?.status === 'unconscious'}
                  />
                  <button
                    type="submit"
                    className="bg-indigo-500 text-white px-4 py-2 rounded-r hover:bg-indigo-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={sendingMessage || character?.status === 'unconscious'}
                  >
                    {sendingMessage ? 'Sending...' : 'Send'}
                  </button>
                </div>
                {character?.status === 'unconscious' && (
                  <p className="mt-2 text-sm text-yellow-700">
                    Your character is unconscious and cannot act. Death saving throws are being made automatically.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Game Actions Panel */}
      <GameActionsPanel
        isOpen={isGameActionsOpen}
        onClose={() => setIsGameActionsOpen(false)}
        onGameAction={handleGameAction}
        showDiceRoller={showDiceRoller}
        onToggleDiceRoller={() => setShowDiceRoller(!showDiceRoller)}
        customDice={customDice}
        setCustomDice={setCustomDice}
        diceReason={diceReason}
        setDiceReason={setDiceReason}
        onRollDice={handleRollDice}
        onCustomDiceRoll={handleCustomDiceRoll}
        rollingDice={rollingDice}
        sendingMessage={sendingMessage}
      />

      {/* Character Sheet Panel */}
      <CharacterSheetPanel
        character={character}
        isOpen={isCharacterSheetOpen}
        onClose={() => setIsCharacterSheetOpen(false)}
        onCharacterUpdate={async (updatedCharacter) => {
          setCharacter(updatedCharacter);
          // Reload campaign to get updated character data
          await loadCampaign();
        }}
      />
    </div>
  );
};

export default CampaignDetails; 
