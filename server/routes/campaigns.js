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
  // Refetch campaign to get latest state and prevent race conditions
  // This ensures we read the most current questLog, objectiveLog, and lootLog
  // before applying updates, preventing concurrent update loss
  const currentCampaign = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    select: {
      questLog: true,
      objectiveLog: true,
      lootLog: true
    }
  });

  if (!currentCampaign) {
    console.error(`Campaign ${campaign.id} not found when applying updates`);
    return;
  }

  const now = new Date().toISOString();
  // Use the freshly fetched campaign data instead of stale campaign object
  const questLog = parseJsonLog(currentCampaign.questLog);
  const objectiveLog = parseJsonLog(currentCampaign.objectiveLog);
  const lootLog = parseJsonLog(currentCampaign.lootLog);
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

// Parse items from natural language text, extracting item names and quantities
// Handles patterns like "5 gold pieces", "3 health potions", "a sword", "the magic ring"
const parseItemsFromText = (text) => {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const items = [];
  const trimmed = text.trim();
  
  if (!trimmed) {
    return items;
  }

  // Split by common delimiters (commas, "and", "&", newlines, semicolons)
  // This handles lists like "sword, shield, and potion" or "sword and shield"
  const itemPatterns = [
    // Pattern: "5 gold pieces" or "3 health potions" (number + item)
    /(\d+)\s+([a-z][a-z\s]+?)(?=\s*[,;&]|\s+and\s+|$)/gi,
    // Pattern: "a sword" or "the magic ring" (article + item)
    /\b(?:a|an|the)\s+([a-z][a-z\s]+?)(?=\s*[,;&]|\s+and\s+|$)/gi,
    // Pattern: standalone items (no quantity or article)
    /\b([A-Z][a-z]+(?:\s+[a-z]+)*)(?=\s*[,;&]|\s+and\s+|$)/g
  ];

  // Try to match structured patterns first
  for (const pattern of itemPatterns) {
    let match;
    while ((match = pattern.exec(trimmed)) !== null) {
      let quantity = 1;
      let itemName = '';

      if (match[1] && /^\d+$/.test(match[1])) {
        // First pattern: number + item
        quantity = parseInt(match[1], 10);
        itemName = match[2].trim();
      } else if (match[1]) {
        // Second or third pattern: article/item name
        itemName = match[1].trim();
      }

      // Clean up item name (remove trailing punctuation, normalize whitespace)
      itemName = itemName.replace(/[.,;:!?]+$/, '').trim();
      
      // Skip if item name is too short or looks invalid
      if (itemName.length < 2 || itemName.length > 100) {
        continue;
      }

      // Skip common non-item words
      const skipWords = ['you', 'find', 'discover', 'receive', 'get', 'obtain', 'pick', 'take', 'grab'];
      if (skipWords.some(word => itemName.toLowerCase().startsWith(word))) {
        continue;
      }

      items.push({
        item: itemName,
        quantity: Math.max(1, quantity) // Ensure quantity is at least 1
      });
    }
  }

  // If no structured patterns matched, try splitting by delimiters
  if (items.length === 0) {
    const parts = trimmed.split(/[,;&]|\s+and\s+/i).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      // Try to extract quantity and item name
      const quantityMatch = part.match(/^(\d+)\s+(.+)$/);
      if (quantityMatch) {
        items.push({
          item: quantityMatch[2].trim(),
          quantity: parseInt(quantityMatch[1], 10)
        });
      } else {
        // No quantity, assume 1
        const cleaned = part.replace(/^(?:a|an|the)\s+/i, '').trim();
        if (cleaned.length >= 2 && cleaned.length <= 100) {
          items.push({
            item: cleaned,
            quantity: 1
          });
        }
      }
    }
  }

  // Remove duplicates and merge quantities for same items (case-insensitive)
  const itemMap = new Map();
  for (const { item, quantity } of items) {
    const normalized = item.toLowerCase().trim();
    if (itemMap.has(normalized)) {
      itemMap.set(normalized, {
        item: itemMap.get(normalized).item, // Keep original casing
        quantity: itemMap.get(normalized).quantity + quantity
      });
    } else {
      itemMap.set(normalized, { item, quantity });
    }
  }

  return Array.from(itemMap.values());
};

// Parse structured items from text using [ITEM:...] or [LOOT:...] format
const parseStructuredItems = (text) => {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const items = [];
  // Match [ITEM:item name] or [LOOT:item name] patterns
  // Also handle quantities: [ITEM:5 gold pieces] or [LOOT:3 health potions]
  const structuredPattern = /\[(?:ITEM|LOOT):([^\]]+)\]/gi;
  
  let match;
  while ((match = structuredPattern.exec(text)) !== null) {
    const content = match[1].trim();
    
    // Try to parse quantity from content
    const quantityMatch = content.match(/^(\d+)\s+(.+)$/);
    if (quantityMatch) {
      items.push({
        item: quantityMatch[2].trim(),
        quantity: parseInt(quantityMatch[1], 10)
      });
    } else {
      // No quantity specified, assume 1
      items.push({
        item: content,
        quantity: 1
      });
    }
  }

  return items;
};

// Detect when players explicitly pick up or take items from their messages
// Returns candidate items that still need validation
const detectPlayerItemAcquisition = (playerMessage) => {
  if (!playerMessage || typeof playerMessage !== 'string') {
    return [];
  }

  const items = [];
  const lowerMessage = playerMessage.toLowerCase();

  // Patterns that indicate item acquisition
  const acquisitionPatterns = [
    /(?:pick\s+up|take|grab|collect|acquire|obtain|get|receive|loot|steal)\s+(?:the\s+)?([a-z][a-z\s]+?)(?=\s*[,;&]|\s+and\s+|$)/gi,
    /(?:pick\s+up|take|grab|collect|acquire|obtain|get|receive|loot|steal)\s+(\d+)\s+([a-z][a-z\s]+?)(?=\s*[,;&]|\s+and\s+|$)/gi
  ];

  for (const pattern of acquisitionPatterns) {
    let match;
    while ((match = pattern.exec(playerMessage)) !== null) {
      let quantity = 1;
      let itemName = '';

      if (match[1] && /^\d+$/.test(match[1])) {
        // Second pattern: verb + number + item
        quantity = parseInt(match[1], 10);
        itemName = match[2].trim();
      } else {
        // First pattern: verb + item
        itemName = match[1].trim();
      }

      // Clean up item name
      itemName = itemName.replace(/[.,;:!?]+$/, '').trim();
      
      // Skip if item name is too short or invalid
      if (itemName.length < 2 || itemName.length > 100) {
        continue;
      }

      items.push({
        item: itemName,
        quantity: Math.max(1, quantity)
      });
    }
  }

  return items;
};

// Validate items using LLM to ensure they are actual items and not descriptive text
const validateItems = async (items, playerMessage) => {
  if (!items || items.length === 0) {
    return [];
  }

  const validatedItems = [];
  
  // Validate each item candidate using LLM
  for (const item of items) {
    try {
      const isValid = await llmService.validateItem(item.item, playerMessage || '');
      if (isValid) {
        validatedItems.push(item);
      } else {
        console.log(`Item validation failed for: "${item.item}" (from message: "${playerMessage}")`);
      }
    } catch (error) {
      console.error(`Error validating item "${item.item}":`, error);
      // On error, skip the item (don't add potentially invalid items)
    }
  }

  return validatedItems;
};

// Parse damage from DM messages - supports both structured format and natural language
// Returns damage amount or null if no damage found
const parseDamageFromMessage = (message) => {
  if (!message || typeof message !== 'string') {
    return null;
  }

  // First, try structured format: [DAMAGE:5] or [DAMAGE:2d6+3]
  const structuredPattern = /\[DAMAGE:([^\]]+)\]/gi;
  let match = structuredPattern.exec(message);
  if (match) {
    const damageStr = match[1].trim();
    
    // Check if it's a dice notation (e.g., "2d6+3")
    const diceRegex = /^(\d+)?d(\d+)([+-]\d+)?$/;
    if (diceRegex.test(damageStr)) {
      // Parse and roll dice notation
      const diceMatch = damageStr.match(diceRegex);
      const numDice = parseInt(diceMatch[1] || '1', 10);
      const sides = parseInt(diceMatch[2], 10);
      const modifier = parseInt(diceMatch[3] || '0', 10);
      
      // Roll the dice
      let total = 0;
      for (let i = 0; i < numDice; i++) {
        total += Math.floor(Math.random() * sides) + 1;
      }
      total += modifier;
      
      return Math.max(0, total); // Ensure non-negative
    } else {
      // Simple number
      const damage = parseInt(damageStr, 10);
      if (!isNaN(damage) && damage > 0) {
        return damage;
      }
    }
  }

  // Try natural language patterns
  // First, check if there's dice notation in the message and skip natural language parsing if found
  // This prevents incorrectly matching "2d6 fire damage" as "6 damage"
  const diceNotationPattern = /\b\d+d\d+(?:[+-]\d+)?\b/gi;
  const hasDiceNotation = diceNotationPattern.test(message);
  
  // Only use natural language patterns if there's no dice notation
  // (dice notation should use structured [DAMAGE:2d6] format)
  if (!hasDiceNotation) {
    const naturalPatterns = [
      // "you take 5 damage" or "you take 5 points of damage"
      // Negative lookahead to ensure we don't match "you take 2d6 damage"
      /(?:you|character|player)\s+(?:take|takes|suffer|suffers|receive|receives)\s+(\d+)(?!d\d+)\s*(?:points?\s+of\s+)?damage/gi,
      // "5 damage" or "5 slashing damage" - but not "2d6 damage"
      // Negative lookahead ensures the number isn't followed by 'd' (dice notation)
      /(?:^|[^d])\b(\d+)(?!d\d+)\s*(?:points?\s+of\s+)?(?:slashing|piercing|bludgeoning|fire|cold|lightning|thunder|acid|poison|radiant|necrotic|psychic|force)?\s*damage/gi,
      // "deals 5 damage" or "deals 5 slashing damage"
      /(?:deal|deals|dealt)\s+(\d+)(?!d\d+)\s*(?:points?\s+of\s+)?(?:slashing|piercing|bludgeoning|fire|cold|lightning|thunder|acid|poison|radiant|necrotic|psychic|force)?\s*damage/gi
    ];

    for (const pattern of naturalPatterns) {
      // Reset regex lastIndex to start from beginning
      pattern.lastIndex = 0;
      match = pattern.exec(message);
      if (match) {
        // Double-check that the matched number isn't part of dice notation
        const matchedNumber = match[1];
        const matchIndex = match.index;
        const beforeMatch = message.substring(Math.max(0, matchIndex - 10), matchIndex);
        const afterMatch = message.substring(matchIndex + match[0].length, matchIndex + match[0].length + 10);
        
        // Check if this number is part of dice notation (e.g., "2d6" or "d6")
        const isPartOfDiceNotation = /\d+d\d+/.test(beforeMatch + matchedNumber + afterMatch) ||
                                     /d\d+/.test(beforeMatch + matchedNumber + afterMatch);
        
        if (!isPartOfDiceNotation) {
          const damage = parseInt(matchedNumber, 10);
          if (!isNaN(damage) && damage > 0) {
            return damage;
          }
        }
      }
    }
  }

  return null;
};

// Apply damage to a character, handling unconscious state
const applyDamageToCharacter = async (characterId, damageAmount) => {
  if (!characterId || !damageAmount || damageAmount <= 0) {
    return null;
  }

  try {
    // Load character from database
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    });

    if (!character) {
      console.error(`Character ${characterId} not found when applying damage`);
      return null;
    }

    // Don't apply damage to deceased characters
    if (character.status === 'deceased') {
      return character;
    }

    // Calculate new HP (minimum 0)
    const newHP = Math.max(0, character.currentHitPoints - damageAmount);
    
    const updateData = {
      currentHitPoints: newHP
    };

    // If HP reaches 0 or below, set to unconscious
    if (newHP <= 0) {
      updateData.status = 'unconscious';
      updateData.deathSavingThrowSuccesses = 0;
      updateData.deathSavingThrowFailures = 0;
    }

    // Update character in database
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: updateData
    });

    return updatedCharacter;
  } catch (error) {
    console.error('Error applying damage to character:', error);
    return null;
  }
};

// Apply healing to a character, handling unconscious state
const applyHealingToCharacter = async (characterId, healingAmount) => {
  if (!characterId || !healingAmount || healingAmount <= 0) {
    return null;
  }

  try {
    // Load character from database
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    });

    if (!character) {
      console.error(`Character ${characterId} not found when applying healing`);
      return null;
    }

    // Don't heal deceased characters
    if (character.status === 'deceased') {
      return character;
    }

    // Calculate new HP (maximum is maxHitPoints)
    const newHP = Math.min(character.maxHitPoints, character.currentHitPoints + healingAmount);
    
    const updateData = {
      currentHitPoints: newHP
    };

    // If character was unconscious and now has HP > 0, revive them
    if (character.status === 'unconscious' && newHP > 0) {
      updateData.status = 'alive';
      updateData.deathSavingThrowSuccesses = 0;
      updateData.deathSavingThrowFailures = 0;
    }

    // Update character in database
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: updateData
    });

    return updatedCharacter;
  } catch (error) {
    console.error('Error applying healing to character:', error);
    return null;
  }
};

// Process death saving throw for an unconscious character
const processDeathSavingThrow = async (characterId, campaignId) => {
  if (!characterId || !campaignId) {
    return null;
  }

  try {
    // Load character and campaign
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    });

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { gameState: true }
    });

    if (!character || !campaign) {
      console.error(`Character or campaign not found for death saving throw`);
      return null;
    }

    // Check if character is unconscious and in combat
    if (character.status !== 'unconscious') {
      return null; // Not unconscious, no death saving throw needed
    }

    // Check if character has already stabilized (3 successes)
    if (character.deathSavingThrowSuccesses >= 3) {
      return null; // Already stabilized
    }

    // Roll d20 (no modifiers for death saving throws)
    const roll = Math.floor(Math.random() * 20) + 1;
    
    let message = '';
    let newSuccesses = character.deathSavingThrowSuccesses;
    let newFailures = character.deathSavingThrowFailures;
    let newStatus = character.status;
    let newHP = character.currentHitPoints;

    // Process roll result
    if (roll === 20) {
      // Natural 20: Instant success - revive with 1 HP
      newHP = 1;
      newStatus = 'alive';
      newSuccesses = 0;
      newFailures = 0;
      message = `Death Saving Throw: Rolled ${roll} (Natural 20!) - Critical Success! ${character.name} regains consciousness with 1 hit point.`;
    } else if (roll === 1) {
      // Natural 1: Counts as 2 failures
      newFailures = Math.min(3, character.deathSavingThrowFailures + 2);
      message = `Death Saving Throw: Rolled ${roll} (Natural 1) - Critical Failure! ${character.name} suffers 2 failures.`;
    } else if (roll >= 10) {
      // Success (10-19)
      newSuccesses = Math.min(3, character.deathSavingThrowSuccesses + 1);
      message = `Death Saving Throw: Rolled ${roll} - Success! ${character.name} has ${newSuccesses} success${newSuccesses !== 1 ? 'es' : ''} (${3 - newSuccesses} more needed to stabilize).`;
    } else {
      // Failure (2-9)
      newFailures = Math.min(3, character.deathSavingThrowFailures + 1);
      message = `Death Saving Throw: Rolled ${roll} - Failure! ${character.name} has ${newFailures} failure${newFailures !== 1 ? 's' : ''} (${3 - newFailures} more and they die).`;
    }

    // Check win/loss conditions
    if (newFailures >= 3) {
      // Character dies
      newStatus = 'deceased';
      message += ` ${character.name} has failed 3 death saving throws and dies.`;
    } else if (newSuccesses >= 3) {
      // Character stabilizes (but remains unconscious)
      message += ` ${character.name} has succeeded on 3 death saving throws and stabilizes. They remain unconscious but are no longer dying.`;
    }

    // Update character
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        currentHitPoints: newHP,
        status: newStatus,
        deathSavingThrowSuccesses: newSuccesses,
        deathSavingThrowFailures: newFailures
      }
    });

    // Create system message
    await prisma.chatMessage.create({
      data: {
        campaignId: campaignId,
        speaker: 'system',
        message: message,
        type: 'system'
      }
    });

    // If character died, handle death
    if (newStatus === 'deceased') {
      await handleCharacterDeath(characterId, campaignId);
    }

    return updatedCharacter;
  } catch (error) {
    console.error('Error processing death saving throw:', error);
    return null;
  }
};

// Handle character death - end campaign and prevent future use
const handleCharacterDeath = async (characterId, campaignId) => {
  try {
    // Set character status to deceased (already done in processDeathSavingThrow)
    // Update campaign status to completed
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'completed'
      }
    });

    // Create system message
    await prisma.chatMessage.create({
      data: {
        campaignId: campaignId,
        speaker: 'system',
        message: `Character has died. The campaign has ended.`,
        type: 'system'
      }
    });
  } catch (error) {
    console.error('Error handling character death:', error);
  }
};

// Add items to character inventory, merging duplicates by incrementing quantity
const addItemsToCharacterInventory = async (characterId, items) => {
  if (!characterId || !items || !Array.isArray(items) || items.length === 0) {
    return;
  }

  try {
    // First, deduplicate the input items array (merge quantities for same items)
    // This prevents issues where the same item appears multiple times in the input
    const itemMap = new Map();
    for (const { item, quantity } of items) {
      // Skip invalid items
      if (!item || typeof item !== 'string' || item.trim().length === 0) {
        continue;
      }

      const itemName = item.trim();
      const itemQuantity = Math.max(1, parseInt(quantity, 10) || 1);
      const normalized = itemName.toLowerCase();

      // Merge quantities for duplicate items in the input
      if (itemMap.has(normalized)) {
        itemMap.set(normalized, {
          item: itemMap.get(normalized).item, // Keep original casing from first occurrence
          quantity: itemMap.get(normalized).quantity + itemQuantity
        });
      } else {
        itemMap.set(normalized, { item: itemName, quantity: itemQuantity });
      }
    }

    // Convert deduplicated map back to array
    const deduplicatedItems = Array.from(itemMap.values());

    if (deduplicatedItems.length === 0) {
      return;
    }

    // Get current character equipment
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { equipment: true }
    });

    if (!character) {
      console.error(`Character ${characterId} not found when adding items`);
      return;
    }

    // Process each deduplicated item
    for (const { item, quantity } of deduplicatedItems) {
      const itemName = item.trim();
      const itemQuantity = Math.max(1, parseInt(quantity, 10) || 1);

      // Check if character already has this item (case-insensitive)
      const existingEquipment = character.equipment.find(
        eq => eq.item.toLowerCase().trim() === itemName.toLowerCase()
      );

      if (existingEquipment) {
        // Increment quantity for existing item
        await prisma.equipment.update({
          where: { id: existingEquipment.id },
          data: {
            quantity: existingEquipment.quantity + itemQuantity
          }
        });
      } else {
        // Create new equipment entry
        const newEquipment = await prisma.equipment.create({
          data: {
            characterId: characterId,
            item: itemName,
            quantity: itemQuantity,
            equipped: false
          }
        });
        
        // Add the newly created item to the in-memory array to prevent duplicate creation
        // if the same item appears again in a future iteration (defensive programming)
        character.equipment.push(newEquipment);
      }
    }
  } catch (error) {
    console.error('Error adding items to character inventory:', error);
    // Don't throw - we don't want to break the main flow if inventory update fails
  }
};

// Create a new campaign
router.post('/', auth, async (req, res) => {
  try {
    const {
      title, setting, tone, description,
      characterId, // Character to use in the campaign
      aiDmSettings // AI DM personality and settings
    } = req.body;

    // Check if character exists and is not deceased
    if (characterId) {
      const character = await prisma.character.findUnique({
        where: { id: characterId }
      });

      if (!character) {
        return res.status(404).json({ error: 'Character not found' });
      }

      if (character.userId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to use this character' });
      }

      if (character.status === 'deceased') {
        return res.status(400).json({ error: 'Cannot use a deceased character in a new campaign' });
      }
    }

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
        character: {
          include: {
            proficiencies: true,
            equipment: true
          }
        },
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
        character: {
          include: {
            proficiencies: true,
            equipment: true
          }
        },
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
        character: {
          include: {
            proficiencies: true,
            equipment: true
          }
        },
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
        character: {
          include: {
            proficiencies: true,
            equipment: true
          }
        },
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
        character: {
          include: {
            proficiencies: true,
            equipment: true
          }
        },
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

    // Parse and apply damage from DM response
    if (campaign.characterId) {
      const damageAmount = parseDamageFromMessage(dmResponse.message);
      if (damageAmount && damageAmount > 0) {
        const updatedCharacter = await applyDamageToCharacter(campaign.characterId, damageAmount);
        if (updatedCharacter && updatedCharacter.status === 'unconscious') {
          // Create system message about falling unconscious
          await prisma.chatMessage.create({
            data: {
              campaignId: campaign.id,
              speaker: 'system',
              message: `${updatedCharacter.name} falls unconscious!`,
              type: 'system'
            }
          });
        }
      }
    }

    // Extract and add items to character inventory
    if (campaign.characterId) {
      const itemsToAdd = [];
      
      // Extract items from DM response (loot sections and structured format)
      // Items from DM response are trusted (DM explicitly gave them)
      const lootItems = actionUpdates.loot || [];
      for (const lootText of lootItems) {
        itemsToAdd.push(...parseItemsFromText(lootText));
      }
      
      // Extract structured items from DM response (these are explicitly marked)
      itemsToAdd.push(...parseStructuredItems(dmResponse.message));
      
      // Extract items from player action if they mentioned picking up items
      // These need validation to ensure they're actual items, not descriptive text
      if (action.description) {
        const playerItemCandidates = detectPlayerItemAcquisition(action.description);
        // Validate player-acquired items using LLM
        const validatedPlayerItems = await validateItems(playerItemCandidates, action.description);
        itemsToAdd.push(...validatedPlayerItems);
      }
      
      // Add all detected items to character inventory
      if (itemsToAdd.length > 0) {
        await addItemsToCharacterInventory(campaign.characterId, itemsToAdd);
      }
    }

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

    // Check for automatic death saving throw if character is unconscious and in combat
    if (campaign.characterId && campaign.gameState && campaign.gameState.combatActive) {
      // Reload character to get latest status
      const currentCharacter = await prisma.character.findUnique({
        where: { id: campaign.characterId }
      });
      
      if (currentCharacter && currentCharacter.status === 'unconscious' && currentCharacter.deathSavingThrowSuccesses < 3) {
        await processDeathSavingThrow(campaign.characterId, campaign.id);
      }
    }

    // Reload campaign with updated character equipment (for potential future use)
    // Note: We don't return it in the response to maintain backward compatibility
    await prisma.campaign.findUnique({
      where: { id: campaign.id },
      include: {
        character: {
          include: {
            proficiencies: true,
            equipment: true
          }
        },
        aiDmSettings: true,
        gameState: true
      }
    });

    // Return response in original format for backward compatibility
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
        character: {
          include: {
            proficiencies: true,
            equipment: true
          }
        },
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
        metadataStr: JSON.stringify({ rolls: dmResponse.rolls, dmRolls: dmResponse.dmRolls })
      }
    });

    // If there were DM rolls, create system messages for each roll for transparency
    if (dmResponse.dmRolls && dmResponse.dmRolls.length > 0) {
      for (const dmRoll of dmResponse.dmRolls) {
        const rollDetails = dmRoll.rolls.length > 1 ? `[${dmRoll.rolls.join(', ')}]` : '';
        const modifierText = dmRoll.modifier ? 
          (dmRoll.modifier > 0 ? ` + ${dmRoll.modifier}` : ` - ${Math.abs(dmRoll.modifier)}`) : '';
        const reasonText = dmRoll.reason ? `${dmRoll.reason}: ` : '';
        
        await prisma.chatMessage.create({
          data: {
            campaignId: campaign.id,
            speaker: 'system',
            message: `${reasonText}DM rolled ${dmRoll.diceNotation} ${rollDetails}${modifierText} = ${dmRoll.total}`,
            type: 'dice_roll',
            metadataStr: JSON.stringify({
              diceNotation: dmRoll.diceNotation,
              rolls: dmRoll.rolls,
              modifier: dmRoll.modifier,
              total: dmRoll.total,
              reason: dmRoll.reason,
              rolledBy: 'dm'
            })
          }
        });
      }
    }

    const chatUpdates = extractCampaignMentions(dmResponse.message);
    await applyCampaignUpdates(campaign, chatUpdates);

    // Parse and apply damage from DM response
    if (campaign.characterId) {
      const damageAmount = parseDamageFromMessage(dmResponse.message);
      if (damageAmount && damageAmount > 0) {
        const updatedCharacter = await applyDamageToCharacter(campaign.characterId, damageAmount);
        if (updatedCharacter && updatedCharacter.status === 'unconscious') {
          // Create system message about falling unconscious
          await prisma.chatMessage.create({
            data: {
              campaignId: campaign.id,
              speaker: 'system',
              message: `${updatedCharacter.name} falls unconscious!`,
              type: 'system'
            }
          });
        }
      }
    }

    // Extract and add items to character inventory
    if (campaign.characterId) {
      const itemsToAdd = [];
      
      // Extract items from DM response (loot sections and structured format)
      // Items from DM response are trusted (DM explicitly gave them)
      const lootItems = chatUpdates.loot || [];
      for (const lootText of lootItems) {
        itemsToAdd.push(...parseItemsFromText(lootText));
      }
      
      // Extract structured items from DM response (these are explicitly marked)
      itemsToAdd.push(...parseStructuredItems(dmResponse.message));
      
      // Extract items from player message if they mentioned picking up items
      // These need validation to ensure they're actual items, not descriptive text
      if (message) {
        const playerItemCandidates = detectPlayerItemAcquisition(message);
        // Validate player-acquired items using LLM
        const validatedPlayerItems = await validateItems(playerItemCandidates, message);
        itemsToAdd.push(...validatedPlayerItems);
      }
      
      // Add all detected items to character inventory
      if (itemsToAdd.length > 0) {
        await addItemsToCharacterInventory(campaign.characterId, itemsToAdd);
      }
    }

    // Check for automatic death saving throw if character is unconscious and in combat
    if (campaign.characterId && campaign.gameState && campaign.gameState.combatActive) {
      // Reload character to get latest status
      const currentCharacter = await prisma.character.findUnique({
        where: { id: campaign.characterId }
      });
      
      if (currentCharacter && currentCharacter.status === 'unconscious' && currentCharacter.deathSavingThrowSuccesses < 3) {
        await processDeathSavingThrow(campaign.characterId, campaign.id);
      }
    }

    // Reload campaign with updated character equipment (for potential future use)
    // Note: We don't return it in the response to maintain backward compatibility
    await prisma.campaign.findUnique({
      where: { id: campaign.id },
      include: {
        character: {
          include: {
            proficiencies: true,
            equipment: true
          }
        },
        aiDmSettings: true,
        gameState: true
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
        metadata: { rolls: dmResponse.rolls, dmRolls: dmResponse.dmRolls }
      }
    ];

    // Return response in original format for backward compatibility
    res.json(responseMessages);
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({ error: 'Error processing chat message' });
  }
});

// Roll dice during gameplay
router.post('/:id/roll', auth, async (req, res) => {
  try {
    // Load full campaign context including settings and history for LLM response
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        character: {
          include: {
            proficiencies: true,
            equipment: true
          }
        },
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
    const manualModifier = matches[3] ? parseInt(matches[3]) : 0;
    
    // Calculate character modifier based on reason if it's a skill check or saving throw
    let characterModifier = 0;
    if (campaign.character && reason && sides === 20) {
      // Check if reason indicates a skill check
      const skillCheckPattern = /(athletics|acrobatics|sleight of hand|stealth|arcana|history|investigation|nature|religion|animal handling|insight|medicine|perception|survival|deception|intimidation|performance|persuasion)/i;
      const skillMatch = reason.match(skillCheckPattern);
      
      if (skillMatch) {
        // It's a skill check - calculate modifier
        const skillName = skillMatch[1].toLowerCase().replace(/\s+/g, '_');
        characterModifier = llmService._getSkillModifier(campaign.character, skillName);
      } else {
        // Check if it's a saving throw
        const savingThrowPattern = /(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+(?:saving\s+)?throw/i;
        const savingThrowMatch = reason.match(savingThrowPattern);
        
        if (savingThrowMatch) {
          const abilityName = savingThrowMatch[1].toLowerCase();
          characterModifier = llmService._getSavingThrowModifier(campaign.character, abilityName);
        }
      }
    }
    
    // Roll the dice
    const rolls = [];
    let total = 0;
    
    for (let i = 0; i < count; i++) {
      const roll = Math.floor(Math.random() * sides) + 1;
      rolls.push(roll);
      total += roll;
    }
    
    // Add modifiers (manual modifier from notation + character modifier)
    const finalTotal = total + manualModifier + characterModifier;
    
    // Calculate total modifier
    const totalModifier = manualModifier + characterModifier;
    
    // Create a descriptive message
    // Note: diceNotation already includes manual modifier (e.g., "d20+3")
    // So we only add modifier text if there's a character modifier to show
    const rollDescription = reason ? `${reason}: ` : '';
    const rollDetails = rolls.length > 1 ? `[${rolls.join(', ')}]` : '';
    let modifierText = '';
    
    // Only show additional modifier text if there's a character modifier
    // The manual modifier is already included in diceNotation, so we don't duplicate it
    if (characterModifier !== 0) {
      // Show character modifier separately since it's not in the notation
      modifierText = characterModifier > 0 ? ` + ${characterModifier}` : ` - ${Math.abs(characterModifier)}`;
      modifierText += ` (character modifier)`;
    }
    // If only manual modifier exists, it's already in diceNotation, so no extra text needed
    
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
          modifier: totalModifier,
          manualModifier,
          characterModifier,
          total: finalTotal,
          reason
        })
      }
    });
    
    // Prepare roll data for LLM context
    const rollData = {
      dice: `d${sides}`,
      result: finalTotal,
      diceNotation,
      rolls,
      modifier: totalModifier,
      manualModifier,
      characterModifier,
      total: finalTotal,
      reason
    };
    
    // Build player message for LLM that includes roll context
    // Format clearly indicates this is a roll RESULT, not a new request
    const playerRollMessage = reason 
      ? `[DICE ROLL RESULT] I rolled ${diceNotation} for ${reason} and got ${finalTotal}.`
      : `[DICE ROLL RESULT] I rolled ${diceNotation} and got ${finalTotal}.`;
    
    // Generate DM response with roll context
    let dmResponse = null;
    let dmMessage = null;
    
    try {
      // Call LLM with roll context
      dmResponse = await llmService.generateDungeonMasterResponse(
        campaign, 
        playerRollMessage,
        { 
          diceRolls: [rollData],
          rollContext: {
            diceNotation,
            rolls,
            modifier: totalModifier,
            manualModifier,
            characterModifier,
            total: finalTotal,
            reason
          }
        }
      );
      
      // Record DM's response
      dmMessage = await prisma.chatMessage.create({
        data: {
          campaignId: campaign.id,
          speaker: 'dm',
          message: dmResponse.message,
          type: dmResponse.type,
          metadataStr: JSON.stringify({ rolls: dmResponse.rolls, dmRolls: dmResponse.dmRolls })
        }
      });
      
      // If there were DM rolls, create system messages for each roll for transparency
      if (dmResponse.dmRolls && dmResponse.dmRolls.length > 0) {
        for (const dmRoll of dmResponse.dmRolls) {
          const dmRollDetails = dmRoll.rolls.length > 1 ? `[${dmRoll.rolls.join(', ')}]` : '';
          const dmModifierText = dmRoll.modifier ? 
            (dmRoll.modifier > 0 ? ` + ${dmRoll.modifier}` : ` - ${Math.abs(dmRoll.modifier)}`) : '';
          const dmReasonText = dmRoll.reason ? `${dmRoll.reason}: ` : '';
          
          await prisma.chatMessage.create({
            data: {
              campaignId: campaign.id,
              speaker: 'system',
              message: `${dmReasonText}DM rolled ${dmRoll.diceNotation} ${dmRollDetails}${dmModifierText} = ${dmRoll.total}`,
              type: 'dice_roll',
              metadataStr: JSON.stringify({
                diceNotation: dmRoll.diceNotation,
                rolls: dmRoll.rolls,
                modifier: dmRoll.modifier,
                total: dmRoll.total,
                reason: dmRoll.reason,
                rolledBy: 'dm'
              })
            }
          });
        }
      }
      
      // Apply any campaign updates from DM response
      const rollUpdates = extractCampaignMentions(dmResponse.message);
      await applyCampaignUpdates(campaign, rollUpdates);

      // Extract and add items to character inventory
      if (campaign.characterId) {
        const itemsToAdd = [];
        
        // Extract items from DM response (loot sections and structured format)
        const lootItems = rollUpdates.loot || [];
        for (const lootText of lootItems) {
          itemsToAdd.push(...parseItemsFromText(lootText));
        }
        
        // Extract structured items from DM response
        itemsToAdd.push(...parseStructuredItems(dmResponse.message));
        
        // Add all detected items to character inventory
        if (itemsToAdd.length > 0) {
          await addItemsToCharacterInventory(campaign.characterId, itemsToAdd);
        }
      }
      
    } catch (llmError) {
      // Log error but don't fail the request - still return the roll result
      console.error('Error generating DM response for dice roll:', llmError);
      // Continue without DM response - graceful degradation
    }
    
    // Return the roll results and DM response (if available)
    const response = {
      success: true,
      roll: {
        diceNotation,
        rolls,
        total: finalTotal,
        modifier: totalModifier,
        manualModifier,
        characterModifier,
        message
      },
      chatMessage
    };
    
    // Add DM response if available
    if (dmMessage) {
      response.dmResponse = {
        ...dmMessage,
        metadata: { rolls: dmResponse?.rolls, dmRolls: dmResponse?.dmRolls }
      };
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Dice roll error:', error);
    res.status(500).json({ error: 'Error processing dice roll' });
  }
});

// Delete a campaign
router.delete('/:id', auth, async (req, res) => {
  try {
    // Find the campaign to verify it exists and user owns it
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Verify the user owns this campaign
    if (campaign.playerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this campaign' });
    }

    // Delete the campaign (cascade deletes will handle related records)
    await prisma.campaign.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Error deleting campaign' });
  }
});

module.exports = router; 
