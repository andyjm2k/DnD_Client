const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  dungeon_master: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  players: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    character: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Character'
    }
  }],
  theme: {
    setting: {
      type: String,
      required: true
    },
    tone: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    }
  },
  status: {
    type: String,
    enum: ['planning', 'active', 'paused', 'completed'],
    default: 'planning'
  },
  current_location: {
    name: String,
    description: String
  },
  current_quest: {
    title: String,
    description: String,
    objectives: [String]
  },
  npcs: [{
    name: String,
    description: String,
    role: String,
    location: String
  }],
  game_state: {
    current_scene: String,
    last_action: String,
    combat_active: {
      type: Boolean,
      default: false
    },
    initiative_order: [{
      entity: String,
      initiative: Number
    }]
  },
  chat_history: [{
    speaker: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['narrative', 'dialog', 'action', 'combat', 'system'],
      required: true
    }
  }],
  settings: {
    model: {
      type: String,
      required: true,
      default: 'gpt-4'
    },
    system_prompt: {
      type: String,
      required: true
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium'
    }
  }
}, {
  timestamps: true
});

// Add indexes for common queries
CampaignSchema.index({ dungeon_master: 1, status: 1 });
CampaignSchema.index({ 'players.user': 1 });

module.exports = mongoose.model('Campaign', CampaignSchema); 