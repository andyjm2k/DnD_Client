# DnD LLM Game Client

A modern web-based Dungeons & Dragons game client powered by Large Language Models. This application provides an interactive and dynamic D&D experience where players can create characters, generate campaigns, and play through AI-driven adventures using the D&D 5th Edition ruleset.

## Features

### Core Features (MVP)
- **Character Creation**
  - Create and customize D&D 5E characters
  - Input character details, backstory, and attributes
  - Save and load character sheets

- **Campaign Management**
  - Define campaign themes and settings
  - Generate AI-driven campaign storylines
  - Save and resume campaigns

- **Interactive Gameplay**
  - Real-time interaction with AI Dungeon Master
  - Turn-based combat system
  - Skill checks and saving throws
  - Inventory management
  - Spell casting system

- **AI Integration**
  - OpenAI-compatible API integration
  - Configurable model selection
  - Custom system prompts for the AI Dungeon Master
  - Hybrid approach combining LLMs with rule-based systems

### Technical Stack
- **Frontend**
  - React 18 with TypeScript
  - React Router v6 for navigation
  - Tailwind CSS for styling
  - Axios for API communication
  - Socket.IO client for real-time features

- **Backend**
  - Node.js with Express
  - Prisma ORM for database management
  - SQLite for data persistence
  - JSON Web Tokens (JWT) for authentication
  - Socket.IO for real-time communication

- **Database Schema**
  - Characters with abilities, equipment, and spells
  - Campaigns with NPCs and game states
  - User management and authentication
  - Chat history and game progression

- **Development Tools**
  - TypeScript for type safety
  - ESLint for code quality
  - Prettier for code formatting
  - npm for package management

  - **AI Integration**
  - OpenAI API compatibility
  - Custom prompt engineering
  - D&D 5E ruleset integration

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- SQLite
- OpenAI API key or compatible endpoint

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/dnd-llm-client.git
cd dnd-llm-client
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
Create a `.env` file in the root directory:
```
DATABASE_URL="file:./dev.db"
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_api_key
```

4. Initialize the database
```bash
npx prisma migrate dev
```

5. Start the development server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Project Structure

```
dnd-llm-client/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API services
│   │   ├── types/        # TypeScript types
│   │   └── utils/        # Utility functions
├── server/                # Backend Node.js application
│   ├── prisma/           # Database schema and migrations
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   └── utils/            # Utility functions
└── shared/               # Shared types and constants
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- D&D 5E SRD for game rules and content
- OpenAI for LLM capabilities
- The D&D community for inspiration and feedback 