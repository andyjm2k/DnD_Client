const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const llmService = require('../services/llmService');

const router = express.Router();
const prisma = new PrismaClient();

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