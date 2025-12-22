const mongoose = require('mongoose');

const CharacterSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  portrait: {
    type: String
  },
  race: {
    type: String,
    required: true
  },
  class: {
    type: String,
    required: true
  },
  level: {
    type: Number,
    required: true,
    default: 1
  },
  background: {
    type: String,
    required: true
  },
  alignment: {
    type: String,
    required: true
  },
  attributes: {
    strength: { type: Number, required: true },
    dexterity: { type: Number, required: true },
    constitution: { type: Number, required: true },
    intelligence: { type: Number, required: true },
    wisdom: { type: Number, required: true },
    charisma: { type: Number, required: true }
  },
  hitPoints: {
    maximum: { type: Number, required: true },
    current: { type: Number, required: true }
  },
  armorClass: {
    type: Number,
    required: true
  },
  proficiencies: {
    skills: [String],
    savingThrows: [String],
    tools: [String],
    languages: [String]
  },
  equipment: [{
    item: String,
    quantity: Number
  }],
  spells: [{
    name: String,
    level: Number,
    description: String
  }],
  features: [{
    name: String,
    description: String,
    source: String
  }],
  backstory: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Add indexes for common queries
CharacterSchema.index({ user: 1, name: 1 });

module.exports = mongoose.model('Character', CharacterSchema); 
