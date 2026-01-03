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
      // If this is a dice roll result (has rollContext), skip skill check detection
      // and treat it as a resolution, not a new request
      const isDiceRollResult = context.rollContext || (context.diceRolls && context.diceRolls.length > 0);
      
      // Only detect skill check requests if this is NOT a dice roll result
      if (!isDiceRollResult) {
        const detectedSkill = this._detectSkillCheckRequest(playerMessage);
        if (detectedSkill) {
          // Route to structured skill check handling
          const action = {
            type: 'skill_check',
            skill: detectedSkill,
            description: playerMessage
          };
          return await this.handleGameAction(campaign, action, context);
        }
      }

      // Process any dice rolls in the player's message
      const { message: processedMessage, rolls } = this._processDiceRolls(playerMessage);
      
      // Add roll results to context
      // If explicit diceRolls are provided in context, use those; otherwise use processed rolls
      const updatedContext = {
        ...context,
        diceRolls: context.diceRolls && context.diceRolls.length > 0 ? context.diceRolls : rolls,
        // Mark this as a roll result resolution if we have roll context
        isRollResult: !!context.rollContext
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

        const aiResponse = response.choices[0].message.content;
        
        // Strip thinking tags from thinking models (o1-preview, o3-mini, etc.)
        const strippedResponse = this._stripThinkingTags(aiResponse);
        
        // Sanitize the response to remove any player dice roll simulation
        const sanitizedResponse = this._sanitizeDiceRolls(strippedResponse);
        
        // Execute any DM dice roll requests in the AI response
        const { message: finalMessage, rolls: dmRolls } = await this.executeDMRolls(sanitizedResponse, campaign.id);

        return {
          message: finalMessage,
          type: this._determineResponseType(finalMessage),
          rolls: rolls, // Player rolls
          dmRolls: dmRolls // DM rolls
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

  async listModels() {
    if (this.useMock) {
      return [];
    }

    if (!this.client?.models?.list) {
      console.warn('OpenAI client does not support listing models.');
      return [];
    }

    try {
      const response = await this.client.models.list();
      if (Array.isArray(response?.data)) {
        return response.data;
      }
      if (Array.isArray(response)) {
        return response;
      }
      console.warn('Unexpected models response format:', response);
      return [];
    } catch (error) {
      console.error('Error fetching models from OpenAI-compatible endpoint:', error);
      return [];
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
      rolls: context.diceRolls || [],
      dmRolls: []
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

      // Strip thinking tags from thinking models before returning
      const content = response.choices[0].message.content;
      return this._stripThinkingTags(content);
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
          const messages = await this._buildConversationHistory(campaign, `[SKILL CHECK REQUEST PHASE]
Player Action: ${action.description}
Skill: ${action.skill}

INSTRUCTIONS FOR THIS PHASE:
- This is a REQUEST phase, NOT a resolution phase
- The player has NOT rolled dice yet
- Your job is to:
  1. Set an appropriate DC (Difficulty Class) for this check
  2. Describe what the player is attempting
  3. Ask the player to roll the dice
- DO NOT determine success or failure yet
- DO NOT narrate what they find or what happens
- DO NOT include "RESULT: SUCCESS" or "RESULT: FAILURE" in your response
- Wait for the player to provide their roll result before narrating outcomes

The system has determined the DC is: ${dc}
Now provide a brief description and ask the player to roll.`, context);
          
          try {
            const response = await this.client.chat.completions.create({
              model: campaign.aiDmSettings.model,
              messages: messages,
              temperature: campaign.aiDmSettings.temperature,
              max_tokens: 500
            });

            // Strip thinking tags from thinking models
            const rawContent = response.choices[0].message.content;
            const strippedContent = this._stripThinkingTags(rawContent);
            
            // Sanitize the response to prevent dice roll simulation
            const sanitizedContent = this._sanitizeDiceRolls(strippedContent);

            return {
              message: `${sanitizedContent}\n\nMake an ${action.skill} check (DC ${dc}).`,
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
          `Resolving ${action.skill} check (DC ${dc}):\nRoll: ${playerRoll}\nModifier: +${skillModifier}\nTotal: ${totalRoll}\n\nRESULT: ${success ? 'SUCCESS' : 'FAILURE'} - The total (${totalRoll}) ${success ? 'meets or exceeds' : 'fails to meet'} the DC of ${dc}.`,
          { ...context, success }
        );

        try {
          const response = await this.client.chat.completions.create({
            model: campaign.aiDmSettings.model,
            messages: messages,
            temperature: campaign.aiDmSettings.temperature,
            max_tokens: 500
            });

          // Strip thinking tags from thinking models
          const rawContent = response.choices[0].message.content;
          const strippedContent = this._stripThinkingTags(rawContent);
          
          // Sanitize the response to prevent dice roll simulation
          const sanitizedContent = this._sanitizeDiceRolls(strippedContent);

          return {
            message: sanitizedContent,
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

        // Strip thinking tags from thinking models
        const rawContent = response.choices[0].message.content;
        const strippedContent = this._stripThinkingTags(rawContent);
        
        return {
          message: strippedContent,
          type: action.type,
          metadata: this._extractActionMetadata(strippedContent, action.type)
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
    // If this is a dice roll result, add context to make it clear this is a resolution
    let messageContent = currentMessage;
    if (context.isRollResult && context.rollContext) {
      const rc = context.rollContext;
      messageContent = `[DICE ROLL RESOLUTION - This is the result of a dice roll, NOT a new skill check request]
Player rolled: ${rc.diceNotation}${rc.rolls && rc.rolls.length > 1 ? ` [${rc.rolls.join(', ')}]` : ''}${rc.modifier ? (rc.modifier > 0 ? ` + ${rc.modifier}` : ` - ${Math.abs(rc.modifier)}`) : ''} = ${rc.total}
${rc.reason ? `Reason: ${rc.reason}` : ''}

${currentMessage}

IMPORTANT: This is a RESOLUTION of a previous skill check or action. Do NOT ask for another skill check. Instead, narrate the outcome based on this roll result.`;
    }
    
    messages.push({
      role: 'user',
      content: messageContent
    });

    return messages;
  }

  _buildSystemPrompt(aiDmSettings) {
    return `You are an AI Dungeon Master for a D&D 5E game with the following characteristics:
Personality: ${aiDmSettings.personality}
Narrative Style: ${aiDmSettings.style}
Rules Enforcement: ${aiDmSettings.rulesEnforcement}

${aiDmSettings.systemPrompt}

CRITICAL: NEVER ROLL DICE FOR PLAYERS
- Players must roll their own dice for all skill checks, saving throws, and attack rolls
- NEVER include dice roll results in your responses for player actions (e.g., "You roll a 15", "The dice show 12")
- NEVER simulate or generate dice roll outcomes for player actions
- When a player roll is needed, state the DC/target and ask the player to roll
- Only narrate outcomes after the player provides their actual roll result
- For NPC/DM rolls, use [DM_ROLL:diceNotation] or [ROLL:diceNotation] notation (e.g., [DM_ROLL:d20+5:Orc attacks])
- The system will automatically execute DM rolls and replace the notation with actual results

CRITICAL: SKILL CHECK TWO-PHASE PROCESS

Skill checks have TWO distinct phases:

PHASE 1: REQUEST PHASE (Player asks to make a check)
- Player says: "I want to do an investigation check" or "Can I make a Perception check?"
- Your response MUST:
  * Set and state the DC (Difficulty Class)
  * Briefly describe what they're attempting
  * Ask them to roll the dice
  * DO NOT determine success/failure
  * DO NOT narrate what they find
  * DO NOT include "RESULT: SUCCESS" or "RESULT: FAILURE"
- Example: "You carefully examine the area. Make an Investigation check (DC 15)."

PHASE 2: RESOLUTION PHASE (Player provides roll result)
- Player provides their roll result (e.g., "I rolled an 8")
- The system calculates: Total Roll vs DC
- The system provides: "RESULT: SUCCESS" or "RESULT: FAILURE"
- Your response MUST:
  * Respect the SUCCESS/FAILURE determination provided
  * Narrate the outcome based on the result
  * Describe what they find (on success) or what happens (on failure)
- Example: If system says "RESULT: FAILURE", narrate that they don't find anything or miss the clue

ITEM AND LOOT MANAGEMENT:
- When players discover, receive, or pick up items, they are automatically added to their character inventory
- Items persist across all campaigns using the same character
- You can format items in two ways:
  1. Structured format (preferred): Use [ITEM:item name] or [LOOT:item name] notation
     - Examples: "You find [ITEM:magic sword] and [ITEM:5 gold pieces]"
     - For quantities: [ITEM:3 health potions] or [LOOT:10 gold pieces]
  2. Natural language in sections: Use "Loot:", "Treasure:", or "Reward:" sections
     - Example: "Loot: sword, shield, 5 gold pieces"
- Both formats work, but structured format [ITEM:...] is more reliable for automatic detection
- When players explicitly pick up items (e.g., "I pick up the sword"), the system will detect and add them automatically

ITEM REMOVAL AND USAGE:
- When players use, drop, give, consume, or remove items, the system automatically removes them from inventory
- Keywords that trigger item removal: use, remove, drop, give, consume, drink, eat, throw, discard
- If a player requests to use/remove/drop an item that is NOT in their inventory, you MUST reject the request
- Rejection examples:
  * "You don't have a [item name] in your inventory."
  * "You search through your belongings but can't find a [item name]."
  * "You don't currently possess a [item name]."
- Reusable items (weapons, armor, tools): When equipped and used/dropped, they are unequipped but NOT removed from inventory
- Consumable items (potions, scrolls, food): When used, they are removed from inventory completely
- If quantity > 1, only one is removed; if quantity = 1, the item is completely removed
- Always acknowledge when items are successfully used/removed in your narrative

DAMAGE AND COMBAT:
- When characters take damage in combat, use structured format [DAMAGE:X] for reliable automatic detection
  - Examples: "The orc's blade strikes you for [DAMAGE:5] slashing damage"
  - For dice damage: "The fireball explodes dealing [DAMAGE:2d6+3] fire damage"
- You can also use natural language (e.g., "you take 5 damage"), but structured format is preferred
- Damage is automatically deducted from character hit points
- When a character reaches 0 HP, they fall unconscious and begin making death saving throws
- Death saving throws are automatic each combat turn - you don't need to roll them
- If a character fails 3 death saving throws, they die and the campaign ends
- If a character succeeds on 3 death saving throws, they stabilize (remain unconscious but no longer dying)
- A natural 20 on a death saving throw immediately revives the character with 1 HP
- A natural 1 on a death saving throw counts as 2 failures

COMBAT TURN ORDER:
- Combat follows initiative order strictly - participants act in the order determined by their initiative rolls
- The system tracks whose turn it is automatically - you will see "Current Turn" and "Is Player's Turn" in the game state
- When it is NOT the player's turn, you MUST describe what the NPCs/enemies do in initiative order before asking for player input
- Process all NPC turns in order until it reaches the player's turn
- Only ask "What do you do?" or similar when it is actually the player's turn
- When processing NPC turns, describe their actions naturally (attacks, movement, spells, etc.)
- Use [DM_ROLL:...] notation for all NPC dice rolls (attack rolls, damage, saving throws, etc.)
- After the player takes their turn, the system automatically advances to the next participant in initiative order

Your responses should:
1. Stay in character as the DM
2. Enforce D&D 5E rules appropriately
3. Create engaging and immersive narratives
4. Respond to player actions fairly
5. Maintain consistent world details
6. Request player dice rolls rather than rolling for them, and use [DM_ROLL:...] notation for NPC/DM rolls
7. Use [ITEM:...] or [LOOT:...] format when giving items to players for reliable inventory tracking
8. Use [DAMAGE:X] format when dealing damage to players for reliable automatic HP deduction`;
  }

  // Helper function to calculate ability modifier from score
  _calculateAbilityModifier(score) {
    return Math.floor((score - 10) / 2);
  }

  // Helper function to get skill modifier based on character stats
  _getSkillModifier(character, skillName) {
    // Map skill names to ability scores
    const skillToAbility = {
      'athletics': 'strength',
      'acrobatics': 'dexterity',
      'sleight_of_hand': 'dexterity',
      'stealth': 'dexterity',
      'arcana': 'intelligence',
      'history': 'intelligence',
      'investigation': 'intelligence',
      'nature': 'intelligence',
      'religion': 'intelligence',
      'animal_handling': 'wisdom',
      'insight': 'wisdom',
      'medicine': 'wisdom',
      'perception': 'wisdom',
      'survival': 'wisdom',
      'deception': 'charisma',
      'intimidation': 'charisma',
      'performance': 'charisma',
      'persuasion': 'charisma'
    };

    // Normalize skill name
    const normalizedSkill = skillName.toLowerCase().replace(/\s+/g, '_');
    const ability = skillToAbility[normalizedSkill];
    
    if (!ability || !character) {
      return 0;
    }

    // Get ability score
    const abilityScore = character[ability] || 10;
    const abilityModifier = this._calculateAbilityModifier(abilityScore);

    // Check if character is proficient in this skill
    const proficiencies = character.proficiencies || [];
    const isProficient = proficiencies.some(p => 
      p.type === 'skills' && p.name.toLowerCase().replace(/\s+/g, '_') === normalizedSkill
    );

    // Calculate proficiency bonus (standard D&D 5E: +2 at level 1-4, +3 at 5-8, etc.)
    const proficiencyBonus = Math.ceil((character.level || 1) / 4) + 1;

    // Return ability modifier + proficiency bonus if proficient
    return abilityModifier + (isProficient ? proficiencyBonus : 0);
  }

  // Helper function to get saving throw modifier
  _getSavingThrowModifier(character, abilityName) {
    if (!character) return 0;

    const ability = abilityName.toLowerCase();
    const abilityScore = character[ability] || 10;
    const abilityModifier = this._calculateAbilityModifier(abilityScore);

    // Check if character is proficient in this saving throw
    const proficiencies = character.proficiencies || [];
    const isProficient = proficiencies.some(p => 
      p.type === 'savingThrows' && p.name.toLowerCase() === ability
    );

    const proficiencyBonus = Math.ceil((character.level || 1) / 4) + 1;

    return abilityModifier + (isProficient ? proficiencyBonus : 0);
  }

  _buildGameStateContext(campaign, context) {
    let contextStr = `Current Game State:
Location: ${campaign.currentLocation} - ${campaign.locationDesc}
Current Quest: ${campaign.currentQuest}
Combat Active: ${campaign.gameState.combatActive}`;
    
    // Add combat turn information if combat is active
    if (campaign.gameState.combatActive && campaign.gameState.initiativeOrder) {
      try {
        // Use parseInitiativeOrder helper to handle both array and object formats
        // Import the helper function logic inline since we can't import from routes
        const initiativeOrderStr = campaign.gameState.initiativeOrder;
        let initiativeOrder = [];
        
        try {
          const parsed = JSON.parse(initiativeOrderStr);
          // Handle different possible formats
          if (Array.isArray(parsed)) {
            // Format: [{name: "Hooded Figure 1", initiative: 15}, ...]
            initiativeOrder = parsed.map(entry => ({
              name: entry.name || entry.entity || entry.participant || String(entry),
              initiative: entry.initiative || entry.init || 0
            }));
          } else if (typeof parsed === 'object' && parsed !== null) {
            // Format: {"Hooded Figure 1": 15, ...}
            initiativeOrder = Object.entries(parsed).map(([name, initiative]) => ({
              name,
              initiative: typeof initiative === 'number' ? initiative : 0
            }));
          }
        } catch (parseError) {
          console.error('Error parsing initiative order in context:', parseError);
        }
        
        const currentTurnIndex = campaign.gameState.currentTurnIndex;
        
        if (initiativeOrder.length > 0) {
          contextStr += `\nInitiative Order: ${initiativeOrderStr}`;
          
          if (currentTurnIndex !== null && currentTurnIndex !== undefined) {
            const currentParticipant = initiativeOrder[currentTurnIndex % initiativeOrder.length];
            if (currentParticipant) {
              contextStr += `\nCurrent Turn: ${currentParticipant.name} (Initiative: ${currentParticipant.initiative || 'N/A'})`;
              
              // Check if it's the player's turn
              if (campaign.character) {
                const isPlayerTurn = currentParticipant.name.toLowerCase().trim() === 
                                     campaign.character.name.toLowerCase().trim();
                contextStr += `\nIs Player's Turn: ${isPlayerTurn ? 'Yes' : 'No'}`;
              }
            }
          }
        } else {
          // If parsing succeeded but resulted in empty array, still include the raw order
          contextStr += `\nInitiative Order: ${initiativeOrderStr}`;
        }
      } catch (error) {
        // If parsing fails, just include the raw initiative order
        contextStr += `\nInitiative Order: ${campaign.gameState.initiativeOrder}`;
      }
    }

    // Add character stats if available
    if (campaign.character) {
      const char = campaign.character;
      const strMod = this._calculateAbilityModifier(char.strength || 10);
      const dexMod = this._calculateAbilityModifier(char.dexterity || 10);
      const conMod = this._calculateAbilityModifier(char.constitution || 10);
      const intMod = this._calculateAbilityModifier(char.intelligence || 10);
      const wisMod = this._calculateAbilityModifier(char.wisdom || 10);
      const chaMod = this._calculateAbilityModifier(char.charisma || 10);
      const proficiencyBonus = Math.ceil((char.level || 1) / 4) + 1;

      contextStr += `\n\nCharacter: ${char.name} (Level ${char.level || 1} ${char.class || ''} ${char.race || ''})
Status: ${char.status || 'alive'}
Hit Points: ${char.currentHitPoints || 0}/${char.maxHitPoints || 0}
Armor Class: ${char.armorClass || 10}
Ability Scores (Modifiers): 
  STR ${char.strength || 10} (${strMod >= 0 ? '+' : ''}${strMod}), 
  DEX ${char.dexterity || 10} (${dexMod >= 0 ? '+' : ''}${dexMod}), 
  CON ${char.constitution || 10} (${conMod >= 0 ? '+' : ''}${conMod}), 
  INT ${char.intelligence || 10} (${intMod >= 0 ? '+' : ''}${intMod}), 
  WIS ${char.wisdom || 10} (${wisMod >= 0 ? '+' : ''}${wisMod}), 
  CHA ${char.charisma || 10} (${chaMod >= 0 ? '+' : ''}${chaMod})
Proficiency Bonus: +${proficiencyBonus}`;

      // Add death saving throw info if unconscious
      if (char.status === 'unconscious') {
        contextStr += `\nDeath Saving Throws: ${char.deathSavingThrowSuccesses || 0} successes, ${char.deathSavingThrowFailures || 0} failures`;
        if ((char.deathSavingThrowSuccesses || 0) >= 3) {
          contextStr += ' (Stabilized - no longer dying)';
        }
      }

      // Add equipped items
      const equippedItems = (char.equipment || []).filter(eq => eq.equipped);
      if (equippedItems.length > 0) {
        contextStr += `\nEquipped Items: ${equippedItems.map(eq => eq.item).join(', ')}`;
      }

      // Add proficiencies summary
      const proficiencies = char.proficiencies || [];
      if (proficiencies.length > 0) {
        const skills = proficiencies.filter(p => p.type === 'skills').map(p => p.name);
        const savingThrows = proficiencies.filter(p => p.type === 'savingThrows').map(p => p.name);
        if (skills.length > 0) {
          contextStr += `\nProficient Skills: ${skills.join(', ')}`;
        }
        if (savingThrows.length > 0) {
          contextStr += `\nProficient Saving Throws: ${savingThrows.join(', ')}`;
        }
      }
    }

    // Add skill check result if present
    if (context.success !== undefined) {
      contextStr += `\nLast Skill Check Result: ${context.success ? 'SUCCESS' : 'FAILURE'}`;
    }

    const questLog = this._parseJsonLog(campaign.questLog);
    const objectiveLog = this._parseJsonLog(campaign.objectiveLog);
    const lootLog = this._parseJsonLog(campaign.lootLog);

    if (questLog.length > 0) {
      const questSummary = questLog.slice(-5).map((entry) => {
        if (entry.description) {
          return `- ${entry.title}: ${entry.description}`;
        }
        return `- ${entry.title}`;
      }).join('\n');
      contextStr += `\nQuest Log:\n${questSummary}`;
    }

    if (objectiveLog.length > 0) {
      const objectiveSummary = objectiveLog.slice(-8).map((entry) => `- ${entry.text}`).join('\n');
      contextStr += `\nObjective Log:\n${objectiveSummary}`;
    }

    if (lootLog.length > 0) {
      const lootSummary = lootLog.slice(-8).map((entry) => `- ${entry.text}`).join('\n');
      contextStr += `\nLoot Log:\n${lootSummary}`;
    }

    // Add dice roll results if present
    if (context.diceRolls && context.diceRolls.length > 0) {
      contextStr += '\nRecent Dice Rolls: ' + context.diceRolls.map(roll => {
        const rollInfo = roll.diceNotation 
          ? `${roll.diceNotation}=${roll.total || roll.result}`
          : `${roll.dice}=${roll.result}`;
        const reasonInfo = roll.reason ? ` (${roll.reason})` : '';
        return rollInfo + reasonInfo;
      }).join(', ');
    }
    
    // Add explicit roll context if present (from dice roll endpoint)
    if (context.rollContext) {
      const rc = context.rollContext;
      const rollDetails = rc.rolls && rc.rolls.length > 1 ? `[${rc.rolls.join(', ')}]` : '';
      const modifierText = rc.modifier ? (rc.modifier > 0 ? ` + ${rc.modifier}` : ` - ${Math.abs(rc.modifier)}`) : '';
      const reasonText = rc.reason ? ` for ${rc.reason}` : '';
      contextStr += `\nPlayer just rolled: ${rc.diceNotation}${rollDetails}${modifierText} = ${rc.total}${reasonText}`;
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

  // Detect skill check requests in chat messages
  _detectSkillCheckRequest(message) {
    const skillCheckPatterns = [
      /(?:want|would like|attempt|try|make|do|perform).*?(?:investigation|perception|insight|athletics|acrobatics|stealth|arcana|history|religion|nature|medicine|survival|animal handling|sleight of hand|deception|intimidation|performance|persuasion).*?(?:check|roll|test)/i,
      /(?:investigation|perception|insight|athletics|acrobatics|stealth|arcana|history|religion|nature|medicine|survival|animal handling|sleight of hand|deception|intimidation|performance|persuasion).*?(?:check|roll|test)/i
    ];
    
    for (const pattern of skillCheckPatterns) {
      if (pattern.test(message)) {
        // Extract skill name
        const skillMatch = message.match(/(investigation|perception|insight|athletics|acrobatics|stealth|arcana|history|religion|nature|medicine|survival|animal handling|sleight of hand|deception|intimidation|performance|persuasion)/i);
        if (skillMatch) {
          // Normalize skill name (handle "animal handling" as two words)
          let skillName = skillMatch[1].toLowerCase();
          if (skillName === 'animal handling') {
            skillName = 'animal_handling';
          } else if (skillName === 'sleight of hand') {
            skillName = 'sleight_of_hand';
          }
          return skillName;
        }
      }
    }
    return null;
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

  // Roll dice for DM/NPC actions using the same random number generator
  async rollDiceForDM(campaignId, diceNotation, reason = '') {
    // Validate dice notation (format: d20, 2d6, d8+3)
    const diceRegex = /^(\d+)?d(\d+)([+-]\d+)?$/;
    if (!diceRegex.test(diceNotation)) {
      throw new Error(`Invalid dice notation: ${diceNotation}`);
    }
    
    // Parse dice notation
    const matches = diceNotation.match(diceRegex);
    const count = matches[1] ? parseInt(matches[1]) : 1;
    const sides = parseInt(matches[2]);
    const modifier = matches[3] ? parseInt(matches[3]) : 0;
    
    // Roll the dice using the same random number generator as player rolls
    const rolls = [];
    let total = 0;
    
    for (let i = 0; i < count; i++) {
      const roll = this._rollDice(sides);
      rolls.push(roll);
      total += roll;
    }
    
    // Add modifier
    const finalTotal = total + modifier;
    
    return {
      diceNotation,
      rolls,
      modifier,
      total: finalTotal,
      reason
    };
  }

  // Parse AI response for DM roll requests
  _processDMRollRequests(message) {
    // Pattern to match DM roll requests: [DM_ROLL:diceNotation] or [ROLL:diceNotation] or [DM_ROLL:diceNotation:reason]
    const dmRollPattern = /\[DM_ROLL:([^\]]+)\]/g;
    const rollPattern = /\[ROLL:([^\]]+)\]/g;
    
    const rollRequests = [];
    
    // Find all DM roll requests
    let match;
    // Reset regex lastIndex
    dmRollPattern.lastIndex = 0;
    rollPattern.lastIndex = 0;
    
    while ((match = dmRollPattern.exec(message)) !== null) {
      const fullMatch = match[0];
      const notation = match[1];
      
      // Parse notation (format: "d20+5" or "2d6+3:Attack roll")
      const parts = notation.split(':');
      const diceNotation = parts[0].trim();
      const reason = parts[1] ? parts[1].trim() : '';
      
      rollRequests.push({
        fullMatch,
        diceNotation,
        reason
      });
    }
    
    // Also check for [ROLL:...] pattern
    while ((match = rollPattern.exec(message)) !== null) {
      const fullMatch = match[0];
      const notation = match[1];
      
      // Parse notation (format: "d20+5" or "2d6+3:Attack roll")
      const parts = notation.split(':');
      const diceNotation = parts[0].trim();
      const reason = parts[1] ? parts[1].trim() : '';
      
      rollRequests.push({
        fullMatch,
        diceNotation,
        reason
      });
    }
    
    return rollRequests;
  }

  // Execute all DM roll requests and replace notation with actual results
  async executeDMRolls(message, campaignId) {
    const rollRequests = this._processDMRollRequests(message);
    
    if (rollRequests.length === 0) {
      return {
        message,
        rolls: []
      };
    }
    
    let processedMessage = message;
    const executedRolls = [];
    
    for (const request of rollRequests) {
      try {
        const rollResult = await this.rollDiceForDM(campaignId, request.diceNotation, request.reason);
        
        // Format the roll result for display
        const rollDetails = rollResult.rolls.length > 1 ? `[${rollResult.rolls.join(', ')}]` : '';
        const modifierText = rollResult.modifier ? 
          (rollResult.modifier > 0 ? ` + ${rollResult.modifier}` : ` - ${Math.abs(rollResult.modifier)}`) : '';
        const reasonText = request.reason ? `${request.reason}: ` : '';
        
        const rollDisplay = `${reasonText}Rolled ${rollResult.diceNotation} ${rollDetails}${modifierText} = ${rollResult.total}`;
        
        // Replace the notation with the actual roll result
        processedMessage = processedMessage.replace(request.fullMatch, rollDisplay);
        
        executedRolls.push({
          ...rollResult,
          reason: request.reason
        });
      } catch (error) {
        console.error(`Error executing DM roll ${request.diceNotation}:`, error);
        // Replace with error message
        processedMessage = processedMessage.replace(
          request.fullMatch, 
          `[Error rolling ${request.diceNotation}]`
        );
      }
    }
    
    return {
      message: processedMessage,
      rolls: executedRolls
    };
  }

  // Sanitize AI responses to prevent player dice roll simulation while preserving DM roll notation
  // Strip thinking tags from LLM responses (for thinking models like o1-preview, o3-mini)
  // Removes <thinking>...</thinking> tags and their content, leaving only the final response
  _stripThinkingTags(content) {
    if (!content || typeof content !== 'string') {
      return content;
    }
    
    // Remove various thinking/reasoning tags (case-insensitive, multiline, non-greedy)
    // Handles: <thinking>, <think>, <reasoning>, <think>, etc.
    let cleanedContent = content;
    
    // First, remove complete tag pairs (opening and closing tags)
    // Match common thinking tag patterns with their content
    const completeTagPatterns = [
      /<think>[\s\S]*?<\/think>/gi,
      /<thinking>[\s\S]*?<\/thinking>/gi,
      /<reasoning>[\s\S]*?<\/reasoning>/gi,
      /<think>[\s\S]*?<\/redacted_reasoning>/gi,
      /<redacted>[\s\S]*?<\/redacted>/gi,
      /<internal>[\s\S]*?<\/internal>/gi,
      /<thought>[\s\S]*?<\/thought>/gi
    ];
    
    // Apply each pattern to remove complete thinking tag pairs
    completeTagPatterns.forEach(pattern => {
      cleanedContent = cleanedContent.replace(pattern, '');
    });
    
    // Also handle any remaining tags with thinking-related names (more flexible pattern)
    // This catches any variations we might have missed
    cleanedContent = cleanedContent.replace(/<[^>]*(?:think|reason|redact|internal)[^>]*>[\s\S]*?<\/[^>]*(?:think|reason|redact|internal)[^>]*>/gi, '');
    
    // Handle unclosed opening tags at the start of content
    // Some models output <thinking> without closing tags
    cleanedContent = cleanedContent.replace(/^[\s\n]*<[^>]*(?:think|reason|redact|internal)[^>]*>[\s\n]*/gi, '');
    
    // Handle any remaining closing tags
    cleanedContent = cleanedContent.replace(/<\/[^>]*(?:think|reason|redact|internal)[^>]*>[\s\n]*/gi, '');
    
    // Clean up any extra whitespace that might be left (multiple newlines, etc.)
    // Replace 3+ consecutive newlines with 2 newlines
    cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');
    
    // Trim leading/trailing whitespace
    cleanedContent = cleanedContent.trim();
    
    return cleanedContent;
  }

  _sanitizeDiceRolls(response) {
    // First, protect DM roll notation from being removed
    const dmRollPlaceholders = [];
    let protectedResponse = response;
    const dmRollPattern = /\[DM_ROLL:[^\]]+\]/g;
    const rollPattern = /\[ROLL:[^\]]+\]/g;
    
    let match;
    let placeholderIndex = 0;
    
    // Protect [DM_ROLL:...] patterns
    while ((match = dmRollPattern.exec(response)) !== null) {
      const placeholder = `__DM_ROLL_PLACEHOLDER_${placeholderIndex}__`;
      dmRollPlaceholders.push({ placeholder, original: match[0] });
      protectedResponse = protectedResponse.replace(match[0], placeholder);
      placeholderIndex++;
    }
    
    // Protect [ROLL:...] patterns
    rollPattern.lastIndex = 0;
    while ((match = rollPattern.exec(response)) !== null) {
      const placeholder = `__DM_ROLL_PLACEHOLDER_${placeholderIndex}__`;
      dmRollPlaceholders.push({ placeholder, original: match[0] });
      protectedResponse = protectedResponse.replace(match[0], placeholder);
      placeholderIndex++;
    }
    
    // Now sanitize player dice roll mentions
    const diceRollPatterns = [
      // Patterns like "You roll a 15", "You rolled 12" (but not "The orc rolls")
      /\b(?:you|the player|your character)\s+(?:roll|rolled|rolls)\s+(?:a\s+)?(\d+)\b/gi,
      // Patterns like "The dice come up 18" (but not in context of DM rolls)
      /\b(?:the\s+)?dice\s+(?:come\s+up|show|result|land|read)\s+(\d+)\b/gi,
      // Patterns like "Rolling... you get a 16"
      /\brolling[^\d]*(\d+)\b/gi,
    ];
    
    let sanitized = protectedResponse;
    diceRollPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, (match, roll) => {
        // Only replace if it's clearly about player rolls
        if (match.toLowerCase().includes('you ') || match.toLowerCase().includes('your ')) {
          return `[Please roll the dice yourself and provide the result]`;
        }
        return match; // Keep NPC/environmental roll mentions
      });
    });
    
    // Restore DM roll placeholders
    dmRollPlaceholders.forEach(({ placeholder, original }) => {
      sanitized = sanitized.replace(placeholder, original);
    });
    
    return sanitized;
  }

  _parseJsonLog(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
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

      // Strip thinking tags from thinking models before returning
      const content = response.choices[0].message.content;
      return this._stripThinkingTags(content);
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

      // Strip thinking tags from thinking models before returning
      const content = response.choices[0].message.content;
      return this._stripThinkingTags(content);
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

      // Strip thinking tags from thinking models before returning
      const content = response.choices[0].message.content;
      return this._stripThinkingTags(content);
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

  // Validate if a parsed item is actually a real item that should be added to inventory
  // Returns true if it's a valid item, false if it's descriptive text or not an item
  async validateItem(itemName, playerMessage) {
    // If using mock, do basic validation
    if (this.useMock) {
      // Basic heuristics for mock mode
      const lowerItem = itemName.toLowerCase().trim();
      // Common non-item phrases that shouldn't be added
      const nonItemPhrases = [
        'a closer look', 'closer to', 'a look', 'a glance', 'a peek',
        'a step', 'a walk', 'a run', 'a jump', 'a turn', 'a move',
        'a breath', 'a moment', 'a second', 'a minute', 'a while',
        'the door', 'the window', 'the gate', 'the entrance', 'the exit',
        'the way', 'the path', 'the road', 'the trail'
      ];
      
      // Check if item name contains any non-item phrases
      for (const phrase of nonItemPhrases) {
        if (lowerItem.includes(phrase)) {
          return false;
        }
      }
      
      // If it's very short (less than 3 chars) or very long (more than 50 chars), likely not an item
      if (lowerItem.length < 3 || lowerItem.length > 50) {
        return false;
      }
      
      // Default to true for mock mode (allow most things)
      return true;
    }

    try {
      // Use LLM to determine if this is actually an item
      const prompt = `You are a D&D 5E Dungeon Master assistant. Your task is to determine if a parsed text string represents an actual physical item that should be added to a character's inventory, or if it's descriptive text, an action, or something else that should NOT be added to inventory.

Player's original message: "${playerMessage}"
Parsed item candidate: "${itemName}"

Examples of things that are NOT items and should return false:
- "a closer look" (descriptive action)
- "closer to the flickering light" (movement/action)
- "the door" (referring to examining/interacting with an object, not picking it up)
- "a step" (movement)
- "the way" (direction/path)
- "a moment" (time reference)
- "the entrance" (location reference)

Examples of things that ARE items and should return true:
- "sword"
- "health potion"
- "gold pieces"
- "magic ring"
- "rope"
- "torch"
- "rock" (if it's a physical object being picked up)

Consider the context of the player's message. If the player said "I take a closer look", then "a closer look" is NOT an item - it's an action. If they said "I pick up the rock", then "rock" IS an item.

Respond with ONLY "true" or "false" (no quotes, no explanation, just the word).`;

      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_API_MODEL || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a D&D 5E assistant that validates whether parsed text represents actual inventory items. Respond with only "true" or "false".' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // Low temperature for consistent validation
        max_tokens: 10 // Only need true/false
      });

      // Strip thinking tags from thinking models before processing
      const rawContent = response.choices[0].message.content;
      const strippedContent = this._stripThinkingTags(rawContent);
      const result = strippedContent.trim().toLowerCase();
      return result === 'true';
    } catch (error) {
      console.error('Error validating item with LLM:', error);
      // On error, default to false (don't add potentially invalid items)
      return false;
    }
  }

  // Determine item category (weapon, armor, tool, consumable, etc.)
  // Returns category string or null if unable to determine
  // Reusable items: weapon, armor, tool
  // Removable items: consumable, treasure, and others
  async determineItemCategory(itemName) {
    if (!itemName || typeof itemName !== 'string') {
      return null;
    }

    // Simple keyword-based categorization for mock mode
    if (this.useMock) {
      const lowerItem = itemName.toLowerCase();
      
      // Weapon keywords
      if (lowerItem.match(/\b(sword|axe|bow|dagger|mace|staff|wand|spear|halberd|flail|whip|rapier|scimitar|club|hammer|weapon)\b/)) {
        return 'weapon';
      }
      
      // Armor keywords
      if (lowerItem.match(/\b(armor|armour|plate|mail|leather|chain|shield|helmet|gauntlet|boot)\b/)) {
        return 'armor';
      }
      
      // Tool keywords
      if (lowerItem.match(/\b(tool|rope|torch|lantern|backpack|bag|pouch|lockpick|thieves|kit|instrument)\b/)) {
        return 'tool';
      }
      
      // Consumable keywords
      if (lowerItem.match(/\b(potion|potion|scroll|food|ration|water|healing|elixir|consumable)\b/)) {
        return 'consumable';
      }
      
      // Default to consumable for unknown items in mock mode
      return 'consumable';
    }

    // Use LLM to determine category
    try {
      const prompt = `You are a D&D 5E assistant that categorizes items.

Item name: "${itemName}"

Categorize this item into one of these categories:
- weapon: Swords, bows, daggers, maces, staffs, wands, etc.
- armor: Armor, shields, helmets, etc.
- tool: Tools, rope, torches, backpacks, instruments, etc.
- consumable: Potions, scrolls, food, rations, etc.
- treasure: Gold, gems, jewelry, etc.
- other: Anything that doesn't fit the above categories

Respond with ONLY the category name (lowercase, one word), or "other" if unsure.`;

      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_API_MODEL || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a D&D 5E assistant that categorizes items. Respond with only the category name.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // Low temperature for consistent categorization
        max_tokens: 20 // Only need category name
      });

      // Strip thinking tags from thinking models before processing
      const rawContent = response.choices[0].message.content;
      const strippedContent = this._stripThinkingTags(rawContent);
      const category = strippedContent.trim().toLowerCase();
      
      // Validate category
      const validCategories = ['weapon', 'armor', 'tool', 'consumable', 'treasure', 'other'];
      if (validCategories.includes(category)) {
        return category;
      }
      
      // Default to 'other' if invalid response
      return 'other';
    } catch (error) {
      console.error('Error determining item category:', error);
      // Default to 'consumable' on error (safer to remove than keep)
      return 'consumable';
    }
  }
}

module.exports = new LLMService(); 
