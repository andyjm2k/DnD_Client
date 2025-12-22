const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const llmService = require('../services/llmService');

const router = express.Router();
const prisma = new PrismaClient();

// Create a new character
router.post('/', auth, async (req, res) => {
  try {
    const {
      name, portrait, race, class: characterClass, background, alignment,
      attributes, hitPoints, armorClass, proficiencies,
      equipment, spells, features, backstory
    } = req.body;

    const character = await prisma.character.create({
      data: {
        userId: req.user.id,
        name,
        portrait,
        race,
        class: characterClass,
        background,
        alignment,
        strength: attributes.strength,
        dexterity: attributes.dexterity,
        constitution: attributes.constitution,
        intelligence: attributes.intelligence,
        wisdom: attributes.wisdom,
        charisma: attributes.charisma,
        maxHitPoints: hitPoints,
        currentHitPoints: hitPoints,
        armorClass,
        backstory,
        proficiencies: {
          create: proficiencies.map(p => ({
            type: p.type,
            name: p.name
          }))
        },
        equipment: {
          create: equipment.map(e => ({
            item: e.item,
            quantity: e.quantity
          }))
        },
        spells: {
          create: spells?.map(s => ({
            name: s.name,
            level: s.level,
            description: s.description
          }))
        },
        features: {
          create: features.map(f => ({
            name: f.name,
            description: f.description,
            source: f.source
          }))
        }
      },
      include: {
        proficiencies: true,
        equipment: true,
        spells: true,
        features: true
      }
    });

    // Update user stats
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        charactersCreated: {
          increment: 1
        }
      }
    });

    res.status(201).json(character);
  } catch (error) {
    console.error('Create character error:', error);
    res.status(500).json({ error: 'Error creating character' });
  }
});

// Get all characters for current user
router.get('/', auth, async (req, res) => {
  try {
    const characters = await prisma.character.findMany({
      where: {
        userId: req.user.id
      },
      include: {
        proficiencies: true,
        equipment: true,
        spells: true,
        features: true
      }
    });

    res.json(characters);
  } catch (error) {
    console.error('Get characters error:', error);
    res.status(500).json({ error: 'Error fetching characters' });
  }
});

// Get a specific character
router.get('/:id', auth, async (req, res) => {
  try {
    const character = await prisma.character.findUnique({
      where: {
        id: req.params.id
      },
      include: {
        proficiencies: true,
        equipment: true,
        spells: true,
        features: true
      }
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this character' });
    }

    res.json(character);
  } catch (error) {
    console.error('Get character error:', error);
    res.status(500).json({ error: 'Error fetching character' });
  }
});

// Update a character
router.patch('/:id', auth, async (req, res) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: req.params.id }
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this character' });
    }

    const {
      name, portrait, race, class: characterClass, background, alignment,
      attributes, hitPoints, armorClass, proficiencies,
      equipment, spells, features, backstory
    } = req.body;

    const updatedCharacter = await prisma.character.update({
      where: { id: req.params.id },
      data: {
        name,
        portrait,
        race,
        class: characterClass,
        background,
        alignment,
        strength: attributes?.strength,
        dexterity: attributes?.dexterity,
        constitution: attributes?.constitution,
        intelligence: attributes?.intelligence,
        wisdom: attributes?.wisdom,
        charisma: attributes?.charisma,
        maxHitPoints: hitPoints,
        currentHitPoints: hitPoints,
        armorClass,
        backstory,
        proficiencies: {
          deleteMany: {},
          create: proficiencies?.map(p => ({
            type: p.type,
            name: p.name
          }))
        },
        equipment: {
          deleteMany: {},
          create: equipment?.map(e => ({
            item: e.item,
            quantity: e.quantity
          }))
        },
        spells: {
          deleteMany: {},
          create: spells?.map(s => ({
            name: s.name,
            level: s.level,
            description: s.description
          }))
        },
        features: {
          deleteMany: {},
          create: features?.map(f => ({
            name: f.name,
            description: f.description,
            source: f.source
          }))
        }
      },
      include: {
        proficiencies: true,
        equipment: true,
        spells: true,
        features: true
      }
    });

    res.json(updatedCharacter);
  } catch (error) {
    console.error('Update character error:', error);
    res.status(500).json({ error: 'Error updating character' });
  }
});

// Delete a character
router.delete('/:id', auth, async (req, res) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: req.params.id }
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this character' });
    }

    await prisma.character.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Character deleted successfully' });
  } catch (error) {
    console.error('Delete character error:', error);
    res.status(500).json({ error: 'Error deleting character' });
  }
});

// Generate character backstory
router.post('/:id/generate-backstory', auth, async (req, res) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: req.params.id }
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to modify this character' });
    }

    const backstory = await llmService.generateCharacterBackground(character);

    await prisma.character.update({
      where: { id: req.params.id },
      data: { backstory }
    });

    res.json({ backstory });
  } catch (error) {
    console.error('Generate backstory error:', error);
    res.status(500).json({ error: 'Error generating backstory' });
  }
});

module.exports = router; 
