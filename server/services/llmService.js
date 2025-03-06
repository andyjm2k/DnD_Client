const { OpenAI } = require('openai');

class LLMService {
  constructor() {
    // Only use mock if API key is missing entirely or if no baseURL is provided with key 'x'
    this.useMock = !process.env.OPENAI_API_KEY || 
                  (process.env.OPENAI_API_KEY === 'x' && !process.env.OPENAI_BASE_URL);
    
    if (!this.useMock) {
      try {
        this.client = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL
        });
        console.log('OpenAI client initialized with API key and baseURL:', process.env.OPENAI_BASE_URL);
      } catch (error) {
        console.error('Failed to initialize OpenAI client:', error);
        this.useMock = true;
      }
    }
    
    if (this.useMock) {
      console.log('Using MOCK LLM responses - no valid API key provided or connection failed');
    }
  }

  async generateDungeonMasterResponse(campaign, playerMessage, context = {}) {
    try {
      // Process any dice rolls in the player's message
      const { message: processedMessage, rolls } = this._processDiceRolls(playerMessage);
      
      // Add roll results to context
      const updatedContext = {
        ...context,
        diceRolls: rolls
      };

      if (this.useMock) {
        return this._generateMockResponse(campaign, processedMessage, updatedContext);
      }

      const messages = await this._buildConversationHistory(campaign, processedMessage, updatedContext);
      
      try {
        const response = await this.client.chat.completions.create({
          model: campaign.aiDmSettings.model,
          messages: messages,
          temperature: campaign.aiDmSettings.temperature,
          max_tokens: 500,
          presence_penalty: 0.6,
          frequency_penalty: 0.3
        });

        return {
          message: response.choices[0].message.content,
          type: this._determineResponseType(response.choices[0].message.content),
          rolls: rolls
        };
      } catch (apiError) {
        console.error('OpenAI API error:', apiError);
        return this._generateMockResponse(campaign, processedMessage, updatedContext);
      }
    } catch (error) {
      console.error('Error generating DM response:', error);
      throw new Error('Failed to generate Dungeon Master response');
    }
  }
  
  // Add a mock response generator for when API is unavailable
  _generateMockResponse(campaign, playerMessage, context) {
    console.log('Generating mock response for:', playerMessage);
    
    // Default response
    let response = "The Dungeon Master considers your words. \"Interesting approach. Let me think about how that unfolds in this world...\"";
    
    // Simple keyword-based responses
    if (playerMessage.toLowerCase().includes('attack')) {
      response = "You ready your weapon and prepare to strike. The enemy braces for your attack.";
    } else if (playerMessage.toLowerCase().includes('investigate') || playerMessage.toLowerCase().includes('check')) {
      response = "You carefully examine your surroundings. With a keen eye, you notice several important details that weren't immediately obvious.";
    } else if (playerMessage.toLowerCase().includes('spell') || playerMessage.toLowerCase().includes('cast')) {
      response = "You begin to channel magical energy, preparing to unleash a spell upon the world.";
    } else if (playerMessage.toLowerCase().includes('talk') || playerMessage.toLowerCase().includes('speak')) {
      response = "Your words seem to have an effect. The NPC listens attentively to what you have to say.";
    }
    
    return {
      message: response,
      type: 'narrative',
      rolls: context.diceRolls || []
    };
  }

  async generateCampaignSetting(theme) {
    try {
      const systemPrompt = `As an expert D&D 5E Dungeon Master, create a detailed campaign setting based on the following theme:
Theme: ${theme.description}
Setting Type: ${theme.setting}
Tone: ${theme.tone}

Include:
1. A rich description of the world and its current state
2. Major locations and their significance
3. Important factions or organizations
4. Current conflicts or tensions
5. Potential adventure hooks
6. Notable NPCs
7. Unique features of this setting`;

      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_API_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate a detailed campaign setting.' }
        ],
        temperature: 0.8,
        max_tokens: 1000
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating campaign setting:', error);
      throw new Error('Failed to generate campaign setting');
    }
  }

  async handleGameAction(campaign, action, context = {}) {
    try {
      if (this.useMock) {
        return this._generateMockActionResponse(action, context);
      }
      
      if (action.type === 'skill_check') {
        // If no roll in the action yet, this is the initial request - set DC and describe the check
        if (!action.description.includes('[d20]')) {
          const dc = this._determineSkillCheckDC(action, campaign.aiDmSettings.difficulty);
          const messages = await this._buildConversationHistory(campaign, `Setting DC for ${action.skill} check: ${action.description}`, context);
          
          try {
            const response = await this.client.chat.completions.create({
              model: campaign.aiDmSettings.model,
              messages: messages,
              temperature: campaign.aiDmSettings.temperature,
              max_tokens: 500
            });

            return {
              message: `${response.choices[0].message.content}\n\nMake an ${action.skill} check (DC ${dc}).`,
              type: 'system',
              metadata: { dc }
            };
          } catch (apiError) {
            console.error('OpenAI API error in skill check:', apiError);
            return {
              message: `The DM considers your action. Make an ${action.skill || 'skill'} check (DC ${dc}).`,
              type: 'system',
              metadata: { dc }
            };
          }
        }
        
        // If there is a roll, this is the resolution phase
        const { message: processedMessage, rolls } = this._processDiceRolls(action.description);
        const playerRoll = rolls[0]?.result || 0;
        const skillModifier = context.skillModifier || 0;
        const totalRoll = playerRoll + skillModifier;
        const dc = context.dc;
        
        const success = totalRoll >= dc;
        
        const messages = await this._buildConversationHistory(campaign, 
          `Resolving ${action.skill} check (DC ${dc}):\nRoll: ${playerRoll}\nModifier: +${skillModifier}\nTotal: ${totalRoll}`,
          { ...context, success }
        );

        try {
          const response = await this.client.chat.completions.create({
            model: campaign.aiDmSettings.model,
            messages: messages,
            temperature: campaign.aiDmSettings.temperature,
            max_tokens: 500
          });

          return {
            message: response.choices[0].message.content,
            type: 'system',
            metadata: {
              dc,
              roll: playerRoll,
              modifier: skillModifier,
              total: totalRoll,
              success
            }
          };
        } catch (apiError) {
          console.error('OpenAI API error in skill check resolution:', apiError);
          return {
            message: success 
              ? `You rolled a ${playerRoll} (+ ${skillModifier} modifier) for a total of ${totalRoll}, which meets or exceeds the DC of ${dc}. Your attempt is successful!` 
              : `You rolled a ${playerRoll} (+ ${skillModifier} modifier) for a total of ${totalRoll}, which fails to meet the DC of ${dc}. Your attempt is unsuccessful.`,
            type: 'system',
            metadata: {
              dc,
              roll: playerRoll,
              modifier: skillModifier,
              total: totalRoll,
              success
            }
          };
        }
      }
      
      // Handle other action types normally
      const actionPrompt = this._buildActionPrompt(action, context);
      const messages = await this._buildConversationHistory(campaign, actionPrompt, context);

      try {
        const response = await this.client.chat.completions.create({
          model: campaign.aiDmSettings.model,
          messages: messages,
          temperature: campaign.aiDmSettings.temperature,
          max_tokens: 500
        });

        return {
          message: response.choices[0].message.content,
          type: action.type,
          metadata: this._extractActionMetadata(response.choices[0].message.content, action.type)
        };
      } catch (apiError) {
        console.error('OpenAI API error in game action:', apiError);
        return this._generateMockActionResponse(action, context);
      }
    } catch (error) {
      console.error('Error handling game action:', error);
      throw new Error('Failed to process game action');
    }
  }

  async _buildConversationHistory(campaign, currentMessage, context = {}) {
    const messages = [
      {
        role: 'system',
        content: this._buildSystemPrompt(campaign.aiDmSettings)
      }
    ];

    // Add game state context
    if (campaign.gameState) {
      messages.push({
        role: 'system',
        content: this._buildGameStateContext(campaign, context)
      });
    }

    // Add recent chat history
    const recentHistory = await this._getRecentChatHistory(campaign);
    messages.push(...recentHistory);

    // Add current message/action
    messages.push({
      role: 'user',
      content: currentMessage
    });

    return messages;
  }

  _buildSystemPrompt(aiDmSettings) {
    return `You are an AI Dungeon Master for a D&D 5E game with the following characteristics:
Personality: ${aiDmSettings.personality}
Narrative Style: ${aiDmSettings.style}
Rules Enforcement: ${aiDmSettings.rulesEnforcement}

${aiDmSettings.systemPrompt}

Your responses should:
1. Stay in character as the DM
2. Enforce D&D 5E rules appropriately
3. Create engaging and immersive narratives
4. Respond to player actions fairly
5. Maintain consistent world details
6. Include relevant dice rolls and mechanics when needed`;
  }

  _buildGameStateContext(campaign, context) {
    let contextStr = `Current Game State:
Location: ${campaign.currentLocation} - ${campaign.locationDesc}
Current Quest: ${campaign.currentQuest}
Combat Active: ${campaign.gameState.combatActive}
${campaign.gameState.combatActive ? `Initiative Order: ${campaign.gameState.initiativeOrder}` : ''}`;

    // Add dice roll results if present
    if (context.diceRolls && context.diceRolls.length > 0) {
      contextStr += '\nDice Rolls: ' + context.diceRolls.map(roll => 
        `${roll.dice}=${roll.result}`
      ).join(', ');
    }

    if (context.additionalContext) {
      contextStr += `\n${context.additionalContext}`;
    }

    return contextStr;
  }

  async _getRecentChatHistory(campaign) {
    // Get recent messages based on contextWindow setting
    const recentMessages = campaign.chatHistory
      // Sort by timestamp to ensure messages are in chronological order (oldest first)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      // Take the most recent N messages based on contextWindow setting
      .slice(-campaign.aiDmSettings.contextWindow)
      .map(msg => ({
        role: msg.speaker === 'dm' ? 'assistant' : 'user',
        content: msg.message
      }));

    return recentMessages;
  }

  _buildActionPrompt(action, context) {
    switch (action.type) {
      case 'skill_check':
        return `Player attempts ${action.skill} check: ${action.description}
Difficulty Class (DC): ${context.dc || 'appropriate to the situation'}`;
      
      case 'combat_action':
        return `Combat Action - ${action.character} attempts: ${action.description}
Current HP: ${context.currentHp}
Conditions: ${context.conditions || 'none'}`;
      
      case 'roleplay':
        return `Roleplay Interaction: ${action.description}`;
      
      default:
        return action.description;
    }
  }

  _determineResponseType(response) {
    if (response.includes('ROLL:') || response.includes('CHECK:')) return 'system';
    if (response.includes('COMBAT:')) return 'combat';
    if (response.startsWith('"') || response.includes('says')) return 'dialog';
    return 'narrative';
  }

  _extractActionMetadata(response, actionType) {
    const metadata = {};

    if (actionType === 'skill_check' || actionType === 'combat_action') {
      // Extract dice rolls
      const rollMatch = response.match(/ROLL: (\d+)/);
      if (rollMatch) metadata.roll = parseInt(rollMatch[1]);

      // Extract success/failure
      metadata.success = response.toLowerCase().includes('success') ||
                        response.toLowerCase().includes('succeeds');
    }

    return metadata;
  }

  _rollDice(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  _processDiceRolls(message) {
    const diceRegex = /\[d(\d+)\]/g;
    const rolls = [];
    let processedMessage = message;
    let match;

    while ((match = diceRegex.exec(message)) !== null) {
      const sides = parseInt(match[1]);
      const roll = this._rollDice(sides);
      rolls.push({ dice: `d${sides}`, result: roll });
      processedMessage = processedMessage.replace(match[0], `[d${sides}:${roll}]`);
    }

    return {
      message: processedMessage,
      rolls: rolls
    };
  }

  async generateCampaign(theme, settings) {
    try {
      const systemPrompt = `Create a D&D 5E campaign outline based on the following theme: ${theme.description}
Setting: ${theme.setting}
Tone: ${theme.tone}

Include:
1. Campaign overview
2. Main quest line
3. Side quests
4. Key NPCs
5. Important locations
6. Potential challenges and encounters`;

      const response = await this.client.chat.completions.create({
        model: settings.model || process.env.OPENAI_API_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate a detailed campaign outline.' }
        ],
        temperature: 0.8,
        max_tokens: 1000
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating campaign:', error);
      throw new Error('Failed to generate campaign');
    }
  }

  async generateCharacterBackground(character) {
    try {
      const prompt = `Create a compelling backstory for a D&D 5E character with the following details:
Race: ${character.race}
Class: ${character.class}
Background: ${character.background}
Alignment: ${character.alignment}

The backstory should include:
1. Origin and upbringing
2. Key life events
3. Motivations and goals
4. Connections to the world
5. Personality traits`;

      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_API_MODEL,
        messages: [
          { role: 'system', content: 'You are a creative writing assistant specializing in D&D character backgrounds.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 500
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating character background:', error);
      throw new Error('Failed to generate character background');
    }
  }

  async generateOpeningScene(theme) {
    try {
      const systemPrompt = `As a D&D 5E Dungeon Master, create an engaging opening scene to begin the adventure. This should be the first description the player sees and should set the stage for their character's entry into the story.

Theme: ${theme.description}
Setting Type: ${theme.setting}
Tone: ${theme.tone}

The scene should:
1. Be immersive and descriptive
2. Set the immediate atmosphere and location
3. Give the player a clear sense of where they are and what's happening
4. End with a hook or situation that invites player interaction
5. Not reveal any future plot points or DM-only information
6. Be concise but evocative (around 2-3 paragraphs)`;

      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_API_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate an opening scene for the player.' }
        ],
        temperature: 0.8,
        max_tokens: 500
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating opening scene:', error);
      throw new Error('Failed to generate opening scene');
    }
  }

  _determineSkillCheckDC(action, difficulty) {
    // Standard D&D 5E Difficulty Classes
    const dcMap = {
      'very_easy': 5,
      'easy': 10,
      'moderate': 15,
      'hard': 20,
      'very_hard': 25,
      'nearly_impossible': 30
    };
    
    // Default to moderate if difficulty not specified
    const defaultDC = dcMap.moderate;
    
    // Adjust based on campaign difficulty setting
    switch (difficulty) {
      case 'easy':
        return Math.max(5, defaultDC - 5);
      case 'hard':
        return Math.min(30, defaultDC + 5);
      default:
        return defaultDC;
    }
  }

  _generateSuccessResponse(action, total, dc) {
    const margin = total - dc;
    if (margin >= 10) {
      return "An exceptional success! You perform the action with remarkable skill and finesse.";
    } else if (margin >= 5) {
      return "A solid success. You perform the action competently and achieve your goal.";
    } else {
      return "You barely succeed, but manage to accomplish your goal.";
    }
  }

  _generateFailureResponse(action, total, dc) {
    const margin = dc - total;
    if (margin >= 10) {
      return "A significant failure. Your attempt goes badly wrong.";
    } else if (margin >= 5) {
      return "You fail to accomplish your goal.";
    } else {
      return "You just barely fail to accomplish your goal.";
    }
  }

  _generateMockActionResponse(action, context) {
    console.log('Generating mock response for action:', action.type);
    
    // Default response based on action type
    let response = "The Dungeon Master acknowledges your action.";
    
    switch (action.type) {
      case 'skill_check':
        response = "The DM evaluates your skill check. Roll a d20 and add your skill modifier to see if you succeed.";
        break;
      case 'combat_action':
        response = "You take a combat action. The enemies respond to your maneuver.";
        break;
      case 'spell':
        response = "You cast your spell. The magical energy flows through you and manifests in the world.";
        break;
      case 'investigate':
        response = "You investigate carefully. There appear to be several clues that might help you.";
        break;
      default:
        response = "The DM considers your action. \"Interesting approach. Let's see how that plays out.\"";
    }
    
    if (action.description) {
      // Try to make the response more relevant to the specific action description
      if (action.description.toLowerCase().includes('portal')) {
        response = "You examine the portal carefully. It seems to be an ancient construction, its frame inscribed with arcane runes that pulse with a faint blue light.";
      } else if (action.description.toLowerCase().includes('enemy') || action.description.toLowerCase().includes('monster')) {
        response = "You assess your opponent, looking for weaknesses and patterns in their movements that you might exploit.";
      }
    }
    
    return {
      message: response,
      type: action.type,
      metadata: {}
    };
  }
}

module.exports = new LLMService(); 