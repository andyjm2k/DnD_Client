import axios from 'axios';
import { Campaign } from '../types/campaign';

const API_URL = '/api/campaigns';
// Use environment variable if available, otherwise fall back to default
// This uses the same base URL configuration as the server-side LLM service
const AI_API_URL = process.env.REACT_APP_OPENAI_BASE_URL || 'http://localhost:1234/v1';
// Optional API key for OpenAI-compatible endpoints that require authentication
const AI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

// Create a separate axios instance for AI API calls
const aiAxios = axios.create({
  baseURL: AI_API_URL,
  withCredentials: false, // Disable sending credentials
  headers: {
    'Content-Type': 'application/json',
    // Add API key header if provided (for OpenAI-compatible APIs that require auth)
    ...(AI_API_KEY && { 'Authorization': `Bearer ${AI_API_KEY}` })
  }
});

export interface AIDMSettings {
  model: string;
  temperature: number;
  personality: string;
  style: string;
  difficulty: string;
}

export interface CreateCampaignData {
  title: string;
  setting: string;
  tone: string;
  description: string;
  characterId: string;
  aiDmSettings: AIDMSettings;
}

// Interface for model data from OpenAI-compatible API
export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

// Campaign service for managing campaigns and fetching available AI models
export const campaignService = {
  // Fetch available models from the OpenAI-compatible endpoint
  getAvailableModels: async function(): Promise<Model[]> {
    // Log that we're attempting to fetch models
    console.log('=== ATTEMPTING TO FETCH MODELS ===');
    console.log('Request URL: /api/llm/models');
    console.log('Axios defaults headers:', axios.defaults.headers.common);
    
    try {
      // Log before making the request
      console.log('Making request to /api/llm/models...');
      
      const response = await axios.get('/api/llm/models', {
        timeout: 10000 // 10 second timeout for responsiveness
      });
      
      // Log the response for debugging
      console.log('Models API response received:', response.data);
      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      
      // Extract models from the response (OpenAI-compatible format)
      // Response format: { data: [{ id: "...", ... }] }
      if (response.data && response.data.data && Array.isArray(response.data.data)) {
        console.log(`Successfully loaded ${response.data.data.length} models`);
        return response.data.data;
      }
      // Some APIs return the array directly
      if (Array.isArray(response.data)) {
        console.log(`Successfully loaded ${response.data.length} models (direct array format)`);
        return response.data;
      }
      console.warn('Unexpected response format:', response.data);
      return [];
    } catch (error: any) {
      // Log detailed error information for debugging - use console.error to ensure visibility
      console.error('=== ERROR FETCHING MODELS ===');
      
      if (error.response) {
        // Server responded with error status
        console.error('Server responded with error:');
        console.error('  Status:', error.response.status);
        console.error('  Status Text:', error.response.statusText);
        console.error('  Response Data:', error.response.data);
        console.error('  Request URL:', error.config?.url);
        console.error('  Request Headers:', error.config?.headers);
      } else if (error.request) {
        // Request was made but no response received (CORS, network error, etc.)
        console.error('No response received (likely CORS or network issue):');
        console.error('  Error Message:', error.message);
        console.error('  Request URL:', error.config?.url);
        console.error('  Base URL:', error.config?.baseURL);
        console.error('  Request Headers:', error.config?.headers);
        console.error('  Full Request Object:', error.request);
      } else {
        // Error setting up the request
        console.error('Request setup error:');
        console.error('  Error Message:', error.message);
        console.error('  Full Error:', error);
      }
      console.error('=== END ERROR DETAILS ===');
      
      // Return empty array for graceful degradation
      return [];
    }
  },
  async createCampaign(data: CreateCampaignData) {
    try {
      // First, generate campaign details using AI
      const aiResponse = await aiAxios.post('/chat/completions', {
        model: data.aiDmSettings.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a D&D 5E Dungeon Master creating a new campaign. Generate engaging content based on the provided parameters.'
          },
          {
            role: 'user',
            content: `Create a D&D campaign with the following parameters:
              Title: ${data.title}
              Setting: ${data.setting}
              Tone: ${data.tone}
              Description: ${data.description}
              
              Generate:
              1. A detailed starting location
              2. An initial quest hook
              3. Key objectives
              4. 2-3 important NPCs`
          }
        ],
        temperature: data.aiDmSettings.temperature || 0.7
      });

      const generatedContent = aiResponse.data.choices[0].message.content;
      const parsedContent = parseAIResponse(generatedContent);

      // Create campaign with AI-generated content
      const campaignData = {
        ...data,
        currentLocation: parsedContent.startingLocation,
        locationDesc: parsedContent.locationDescription,
        currentQuest: parsedContent.questHook,
        questDesc: parsedContent.questDescription,
        objectives: parsedContent.objectives,
        npcs: parsedContent.npcs,
        status: 'active',
        systemPrompt: generateSystemPrompt(data, parsedContent)
      };

      const response = await axios.post(API_URL, campaignData);
      return response.data;
    } catch (error) {
      console.error('Error creating campaign:', error);
      throw error;
    }
  },

  async getCampaigns() {
    try {
      const response = await axios.get(API_URL);
      return response.data;
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      throw error;
    }
  },

  async getCampaign(id: string) {
    try {
      const response = await axios.get(`${API_URL}/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching campaign:', error);
      throw error;
    }
  },

  async updateCampaign(id: string, data: Partial<Campaign>) {
    try {
      const response = await axios.patch(`${API_URL}/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating campaign:', error);
      throw error;
    }
  },

  async deleteCampaign(id: string) {
    try {
      const response = await axios.delete(`${API_URL}/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting campaign:', error);
      throw error;
    }
  },

  async sendChatMessage(campaignId: string, message: string, type: string = 'dialog') {
    try {
      const response = await axios.post(`${API_URL}/${campaignId}/chat`, { message, type });
      return response.data;
    } catch (error) {
      console.error('Error in sendChatMessage:', error);
      throw error;
    }
  },

  async rollDice(campaignId: string, diceNotation: string, reason: string = '') {
    try {
      const response = await axios.post(`${API_URL}/${campaignId}/roll`, { diceNotation, reason });
      
      return response.data;
    } catch (error) {
      console.error('Error in rollDice:', error);
      throw error;
    }
  }
};

function parseAIResponse(content: string): {
  startingLocation: string;
  locationDescription: string;
  questHook: string;
  questDescription: string;
  objectives: string;
  npcs: Array<{
    name: string;
    description: string;
    role: string;
    location: string;
  }>;
} {
  // This is a simple parser - you might want to make it more robust
  const sections = content.split('\n\n');
  const npcs: Array<{name: string; description: string; role: string; location: string}> = [];
  let startingLocation = '';
  let locationDescription = '';
  let questHook = '';
  let questDescription = '';
  let objectives = '';

  sections.forEach(section => {
    if (section.toLowerCase().includes('location:')) {
      const [title, ...desc] = section.split('\n');
      startingLocation = title.replace('Location:', '').trim();
      locationDescription = desc.join('\n').trim();
    } else if (section.toLowerCase().includes('quest:')) {
      const [title, ...desc] = section.split('\n');
      questHook = title.replace('Quest:', '').trim();
      questDescription = desc.join('\n').trim();
    } else if (section.toLowerCase().includes('objectives:')) {
      objectives = section.replace('Objectives:', '').trim();
    } else if (section.toLowerCase().includes('npc:')) {
      const lines = section.split('\n');
      const name = lines[0].replace('NPC:', '').trim();
      const role = lines[1]?.includes('Role:') ? lines[1].replace('Role:', '').trim() : 'Unknown';
      const location = lines[2]?.includes('Location:') ? lines[2].replace('Location:', '').trim() : 'Unknown';
      const description = lines.slice(3).join('\n').trim();
      
      npcs.push({ name, description, role, location });
    }
  });

  return {
    startingLocation,
    locationDescription,
    questHook,
    questDescription,
    objectives,
    npcs
  };
}

function generateSystemPrompt(data: CreateCampaignData, content: ReturnType<typeof parseAIResponse>): string {
  return `You are a D&D 5E Dungeon Master running a ${data.tone} campaign in a ${data.setting} setting.

Campaign: ${data.title}
${data.description}

Current Location: ${content.startingLocation}
${content.locationDescription}

Active Quest: ${content.questHook}
${content.questDescription}

Key Objectives:
${content.objectives}

Important NPCs:
${content.npcs.map(npc => `- ${npc.name} (${npc.role}): ${npc.description}`).join('\n')}

CRITICAL DM ROLE GUIDELINES:
- YOU are responsible for world-building and providing information about the game world
- When a player asks about something their character might know, PROVIDE SPECIFIC INFORMATION
- NEVER say "I don't have information" or "I don't know" - instead, create appropriate lore and details
- NEVER refer to yourself as an "AI" or "AI Dungeon Master" - stay in character as the DM
- NEVER ask the player to create world details - that is YOUR job as the DM
- When a player asks a question like "Do I know X?" or "Is there X in this town?", provide definitive answers
- ALWAYS give concrete, specific information rather than vague or deflecting responses
- Continue developing the world, lore, and NPCs consistently throughout the campaign

DM Guidelines for Skill Checks:
- Set appropriate Difficulty Classes (DCs) based on standard 5E rules:
  * Very Easy (DC 5): Tasks that anyone can accomplish
  * Easy (DC 10): Tasks requiring minimal training or ability
  * Medium (DC 15): Tasks requiring significant training or ability
  * Hard (DC 20): Tasks that experts might find challenging
  * Very Hard (DC 25): Tasks at the limit of human capability
  * Nearly Impossible (DC 30): Tasks beyond normal human capability
- Explicitly state the DC when a player attempts a skill check
- Be consistent with DCs for similar tasks throughout the campaign
- Consider environmental factors and character preparation when setting DCs
- Allow creative approaches to bypass or reduce DCs when appropriate

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

CRITICAL DICE ROLLING RULES:

FOR PLAYER ROLLS (Skill Checks, Saving Throws, Attack Rolls):
- NEVER roll dice on behalf of the player - players must roll their own dice
- NEVER include dice roll results for player actions (e.g., "You roll a 15", "The dice show 12")
- NEVER simulate or generate dice roll outcomes for player actions
- When a player skill check, saving throw, or attack roll is needed:
  1. State the DC or target number clearly
  2. Tell the player to roll the dice (e.g., "Make a Dexterity saving throw (DC 15)" or "Roll a d20 and add your Strength modifier")
  3. Wait for the player to provide their roll result
  4. Only then narrate the outcome based on the actual roll result they provide
- DO NOT create fictional dice roll results or assume what the player rolled

FOR DM/NPC ROLLS (NPC Actions, Environmental Events, Hidden Checks):
- YOU MUST roll dice for NPCs, monsters, and DM-controlled events
- Use the special notation [DM_ROLL:diceNotation] or [ROLL:diceNotation] to request a dice roll
- Examples:
  * NPC attack: [DM_ROLL:d20+5:Orc attacks]
  * NPC saving throw: [DM_ROLL:d20+2:Goblin Dexterity save]
  * Environmental damage: [DM_ROLL:2d6:Fire damage]
  * Stealth check: [DM_ROLL:d20+3:Guard's Perception]
- The system will automatically roll the dice and replace the notation with the actual result
- Always use this notation when NPCs or environmental effects need dice rolls
- You can include a reason after the dice notation: [DM_ROLL:d20+5:Attack roll]
- DO NOT write out dice roll results directly - always use the [DM_ROLL:...] notation

Examples:
INCORRECT (Rolling for Player):
Player: "I want to check for traps"
DM: "You roll a d20 and get a 15. You notice a pressure plate..."

CORRECT (Asking Player to Roll):
Player: "I want to check for traps"
DM: "You carefully examine the floor. Make a Perception check (DC 15)."

INCORRECT (Simulating NPC Roll):
DM: "The orc attacks and rolls a 12, hitting you for 8 damage."

CORRECT (Using DM Roll Notation):
DM: "The orc swings its axe at you! [DM_ROLL:d20+5:Orc attack] If it hits, you take [DM_ROLL:1d8+3:Damage] slashing damage."

Narrative Balance Guidelines:
- Let the player drive the story - follow their lead rather than pushing your own agenda
- Present obstacles, situations, and choices, but allow players to determine the path forward
- Respond to player actions rather than scripting the adventure too rigidly
- Offer clear decision points and meaningful consequences rather than railroading
- Provide environment descriptions and NPC reactions, but avoid narrating player feelings or decisions
- Balance spotlight time between exploration, social interaction, and combat encounters
- Ask questions to encourage player agency when direction is unclear
- When players ask for information their character would know, PROVIDE IT - don't make them create it

Response Examples:

INCORRECT (Bad DM):
Player: "Do I know where someone associated with my old Master might be?"
DM: "As an AI Dungeon Master, I don't have access to specific details about your late Master or his associates. Can you recall any connections?"

CORRECT (Good DM):
Player: "Do I know where someone associated with my old Master might be?"
DM: "Yes, you recall that your Master often spoke of his colleague Eliana, an elven sage who resides in the Moonlit Tower just north of Thorndale. Your Master mentioned visiting her whenever he needed guidance on ancient artifacts. She would likely remember you from when you accompanied him years ago."

Style Guidelines:
- Maintain a ${data.tone} tone throughout the campaign
- Focus on player agency and meaningful choices
- Balance combat, roleplay, and exploration
- Adapt to player decisions while maintaining narrative coherence
- Keep responses concise but descriptive

Remember to:
1. Stay consistent with established lore and NPCs
2. Enforce D&D 5E rules appropriately, especially for skill checks and saving throws
3. Create engaging and dynamic scenarios that respond to player choices
4. Provide clear consequences for player actions
5. Maintain narrative tension and pacing without dominating the story
6. ALWAYS provide concrete information when players ask questions about the world or what their character knows`;
} 
