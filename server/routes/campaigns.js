const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const llmService = require('../services/llmService');

const router = express.Router();
const prisma = new PrismaClient();

const CAMPAIGN_MARKERS = [
  'Current Quest',
  'Quest',
  'Objective',
  'Objectives',
  'Reward',
  'Rewards',
  'Loot',
  'Treasure'
];

const CAMPAIGN_SECTION_REGEX = new RegExp(
  `(?:\\*\\*)?(${CAMPAIGN_MARKERS.join('|')})(?:\\*\\*)?:\\s*([\\s\\S]*?)(?=(?:\\*\\*)?(?:${CAMPAIGN_MARKERS.join('|')})(?:\\*\\*)?:|$)`,
  'gi'
);

const parseJsonLog = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const splitListEntries = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const bulletPattern = /(?:^|\n)\s*(?:[-*•]|\d+\.)\s+/;
  if (bulletPattern.test(trimmed)) {
    return trimmed
      .split(/\n\s*(?:[-*•]|\d+\.)\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (trimmed.includes('\n')) {
    return trimmed
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (trimmed.includes(';')) {
    return trimmed
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [trimmed];
};

const extractCampaignMentions = (message) => {
  const updates = {
    questTitle: '',
    questDescription: '',
    objectives: [],
    loot: []
  };

  const cleanedMessage = message.replace(/\r/g, '').trim();
  if (!cleanedMessage) {
    return updates;
  }

  CAMPAIGN_SECTION_REGEX.lastIndex = 0;

  let match;
  while ((match = CAMPAIGN_SECTION_REGEX.exec(cleanedMessage)) !== null) {
    const marker = match[1].toLowerCase();
    const value = match[2]?.trim() || '';

    if (!value) {
      continue;
    }

    if (marker.includes('quest')) {
      const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
      updates.questTitle = lines[0] || value;
      updates.questDescription = lines.slice(1).join('\n').trim();
    } else if (marker.includes('objective')) {
      updates.objectives.push(...splitListEntries(value));
    } else if (marker.includes('reward') || marker.includes('loot') || marker.includes('treasure')) {
      updates.loot.push(...splitListEntries(value));
    }
  }

  return updates;
};

const applyCampaignUpdates = async (campaign, updates) => {
  const now = new Date().toISOString();
  const questLog = parseJsonLog(campaign.questLog);
  const objectiveLog = parseJsonLog(campaign.objectiveLog);
  const lootLog = parseJsonLog(campaign.lootLog);
  const data = {};

  let hasUpdates = false;
  let questLogChanged = false;
  let objectiveLogChanged = false;
  let lootLogChanged = false;

  if (updates.questTitle) {
    data.currentQuest = updates.questTitle;
    if (updates.questDescription) {
      data.questDesc = updates.questDescription;
    }
    hasUpdates = true;

    const existingQuest = questLog.find(
      (entry) => entry.title?.toLowerCase() === updates.questTitle.toLowerCase()
    );
    if (!existingQuest) {
      questLog.push({
        title: updates.questTitle,
        description: updates.questDescription || '',
        identifiedAt: now
      });
      questLogChanged = true;
    }
  }

  if (updates.objectives.length > 0) {
    data.objectives = updates.objectives.join('\n');
    hasUpdates = true;

    updates.objectives.forEach((objective) => {
      const exists = objectiveLog.some(
        (entry) => entry.text?.toLowerCase() === objective.toLowerCase()
      );
      if (!exists) {
        objectiveLog.push({
          text: objective,
          identifiedAt: now
        });
        objectiveLogChanged = true;
      }
    });
  }

  if (updates.loot.length > 0) {
    updates.loot.forEach((item) => {
      const exists = lootLog.some(
        (entry) => entry.text?.toLowerCase() === item.toLowerCase()
      );
      if (!exists) {
        lootLog.push({
          text: item,
          identifiedAt: now
        });
        lootLogChanged = true;
      }
    });
    hasUpdates = true;
  }

  if (questLogChanged) {
    data.questLog = JSON.stringify(questLog);
  }
  if (objectiveLogChanged) {
    data.objectiveLog = JSON.stringify(objectiveLog);
  }
  if (lootLogChanged) {
    data.lootLog = JSON.stringify(lootLog);
  }

  if (!hasUpdates) {
    return;
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data
  });
};

// Create a new campaign
router.post('/', auth, async (req, res) => {
  try {
    const {
      title, setting, tone, description,
      characterId, // Character to use in the campaign
      aiDmSettings // AI DM personality and settings
    } = req.body;

    // Generate initial campaign setting (for DM's reference)
    const campaignSetting = await llmService.generateCampaignSetting({
      description,
      setting,
      tone
    });

    // Generate player's opening scene
    const openingScene = await llmService.generateOpeningScene({
      description,
      setting,
      tone
    });

    const campaign = await prisma.campaign.create({
      data: {
        title,
        setting,
        tone,
        description,
        systemPrompt: aiDmSettings.systemPrompt || "You are a D&D 5E Dungeon Master helping to test the system. Keep responses brief but helpful.",
        player: {
          connect: { id: req.user.id }
        },
        character: {
          connect: { id: characterId }
        },
        aiDmSettings: {
          create: {
            personality: aiDmSettings.personality || "A friendly and creative DM who balances storytelling with fair rule enforcement",
            style: aiDmSettings.style || "Descriptive and engaging, with a focus on player agency",
            model: aiDmSettings.model || "gpt-4",
            temperature: aiDmSettings.temperature || 0.7,
            difficulty: aiDmSettings.difficulty || "medium",
            rulesEnforcement: aiDmSettings.rulesEnforcement || "moderate",
            systemPrompt: aiDmSettings.systemPrompt || "You are a D&D 5E Dungeon Master helping to test the system. Keep responses brief but helpful.",
            contextWindow: aiDmSettings.contextWindow || 5
          }
        },
        gameState: {
          create: {
            combatActive: false,
            currentScene: openingScene // Store the current scene
          }
        }
      },
      include: {
        character: true,
        aiDmSettings: true,
        gameState: true,
        player: true,
        chatHistory: true
      }
    });

    // Store the DM's campaign setting as a system message
    await prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        speaker: 'system',
        message: campaignSetting,
        type: 'dm_notes'
      }
    });

    // Create the player-facing opening scene message
    const initialMessage = await prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        speaker: 'dm',
        message: openingScene,
        type: 'narrative'
      }
    });

    // Add only the opening scene message to the response
    const campaignWithChat = {
      ...campaign,
      chatHistory: [initialMessage]
    };

    // Update user stats
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        campaignsCreated: {
          increment: 1
        }
      }
    });

    res.status(201).json(campaignWithChat);
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Error creating campaign' });
  }
});

// Get all campaigns for current user
router.get('/', auth, async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        playerId: req.user.id
      },
      include: {
        character: true,
        aiDmSettings: true,
        gameState: true
      }
    });

    res.json(campaigns);
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Error fetching campaigns' });
  }
});

// Get a specific campaign
router.get('/:id', auth, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        character: true,
        aiDmSettings: true,
        npcs: true,
        chatHistory: {
          orderBy: {
            timestamp: 'desc'
          },
          take: 50
        },
        gameState: true
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.playerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this campaign' });
    }

    res.json(campaign);
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Error fetching campaign' });
  }
});

// Update campaign settings
router.patch('/:id/settings', auth, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.playerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this campaign' });
    }

    const { aiDmSettings } = req.body;

    const updatedCampaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        aiDmSettings: {
          update: {
            ...aiDmSettings
          }
        }
      },
      include: {
        character: true,
        aiDmSettings: true,
        gameState: true
      }
    });

    res.json(updatedCampaign);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Error updating campaign settings' });
  }
});

// Perform game action
router.post('/:id/action', auth, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        character: true,
        aiDmSettings: true,
        gameState: true,
        chatHistory: {
          orderBy: {
            timestamp: 'desc'
          },
          take: 5
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.playerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to play this campaign' });
    }

    const { action, context } = req.body;

    // Record player action
    const playerMessage = await prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        speaker: 'player',
        message: action.description,
        type: action.type,
        metadataStr: JSON.stringify(context || {})
      }
    });

    // Get DM's response
    const dmResponse = await llmService.handleGameAction(campaign, action, context);

    // Record DM's response
    const dmMessage = await prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        speaker: 'dm',
        message: dmResponse.message,
        type: dmResponse.type,
        metadataStr: JSON.stringify(dmResponse.metadata || {})
      }
    });

    const actionUpdates = extractCampaignMentions(dmResponse.message);
    await applyCampaignUpdates(campaign, actionUpdates);

    // Update game state if needed
    if (action.type === 'combat_action' || dmResponse.type === 'combat') {
      await prisma.gameState.update({
        where: { campaignId: campaign.id },
        data: {
          combatActive: true,
          lastAction: action.description,
          initiativeOrder: context.initiativeOrder || campaign.gameState.initiativeOrder
        }
      });
    }

    res.json({
      playerMessage,
      dmResponse: dmMessage
    });
  } catch (error) {
    console.error('Game action error:', error);
    res.status(500).json({ error: 'Error processing game action' });
  }
});

// Add chat message and get DM response
router.post('/:id/chat', auth, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        character: true,
        aiDmSettings: true,
        gameState: true,
        chatHistory: {
          orderBy: {
            timestamp: 'desc'
          },
          take: 5
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.playerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to participate in this campaign' });
    }

    const { message, type } = req.body;

    // Process any dice rolls in the player's message first
    const { message: processedMessage, rolls } = llmService._processDiceRolls(message);

    // Record player message BEFORE getting DM response
    const playerMessage = await prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        speaker: 'player',
        message: processedMessage,
        type: type || 'dialog',
        metadataStr: JSON.stringify({ rolls: rolls })
      }
    });

    // Now get the DM's response (after player message is recorded)
    const dmResponse = await llmService.generateDungeonMasterResponse(campaign, message);

    // Record DM's response
    const dmMessage = await prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        speaker: 'dm',
        message: dmResponse.message,
        type: dmResponse.type,
        metadataStr: JSON.stringify({ rolls: dmResponse.rolls })
      }
    });

    const chatUpdates = extractCampaignMentions(dmResponse.message);
    await applyCampaignUpdates(campaign, chatUpdates);

    // Add metadata to the response
    const responseMessages = [
      {
        ...playerMessage,
        metadata: { rolls: rolls }
      },
      {
        ...dmMessage,
        metadata: { rolls: dmResponse.rolls }
      }
    ];

    res.json(responseMessages);
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({ error: 'Error processing chat message' });
  }
});

// Roll dice during gameplay
router.post('/:id/roll', auth, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        character: true
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.playerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to play this campaign' });
    }

    const { diceNotation, reason } = req.body;
    
    // Validate dice notation (e.g., "d20", "2d6", "d8+3")
    const diceRegex = /^(\d+)?d(\d+)([+-]\d+)?$/;
    if (!diceRegex.test(diceNotation)) {
      return res.status(400).json({ error: 'Invalid dice notation. Use format like d20, 2d6, or d8+3' });
    }
    
    // Parse dice notation
    const matches = diceNotation.match(diceRegex);
    const count = matches[1] ? parseInt(matches[1]) : 1;
    const sides = parseInt(matches[2]);
    const modifier = matches[3] ? parseInt(matches[3]) : 0;
    
    // Roll the dice
    const rolls = [];
    let total = 0;
    
    for (let i = 0; i < count; i++) {
      const roll = Math.floor(Math.random() * sides) + 1;
      rolls.push(roll);
      total += roll;
    }
    
    // Add modifier
    const finalTotal = total + modifier;
    
    // Create a descriptive message
    const rollDescription = reason ? `${reason}: ` : '';
    const rollDetails = rolls.length > 1 ? `[${rolls.join(', ')}]` : '';
    const modifierText = modifier ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : '';
    
    const message = `${rollDescription}Rolled ${diceNotation} ${rollDetails}${modifierText} = ${finalTotal}`;
    
    // Save the roll to the chat history
    const chatMessage = await prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        speaker: 'system',
        message: message,
        type: 'dice_roll',
        metadataStr: JSON.stringify({
          diceNotation,
          rolls,
          modifier,
          total: finalTotal,
          reason
        })
      }
    });
    
    // Return the roll results
    res.json({
      success: true,
      roll: {
        diceNotation,
        rolls,
        total: finalTotal,
        modifier,
        message
      },
      chatMessage
    });
    
  } catch (error) {
    console.error('Dice roll error:', error);
    res.status(500).json({ error: 'Error processing dice roll' });
  }
});

module.exports = router; 
