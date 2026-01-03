import React from 'react';

// Dice presets for quick rolling
const DICE_PRESETS = [
  { label: 'd20', notation: 'd20' },
  { label: 'd12', notation: 'd12' },
  { label: 'd10', notation: 'd10' },
  { label: 'd8', notation: 'd8' },
  { label: 'd6', notation: 'd6' },
  { label: 'd4', notation: 'd4' },
  { label: '2d6', notation: '2d6' },
  { label: '3d6', notation: '3d6' }
];

interface GameActionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onGameAction: (actionType: string) => void;
  showDiceRoller: boolean;
  onToggleDiceRoller: () => void;
  customDice: string;
  setCustomDice: (value: string) => void;
  diceReason: string;
  setDiceReason: (value: string) => void;
  onRollDice: (notation: string) => void;
  onCustomDiceRoll: (e: React.FormEvent) => void;
  rollingDice: boolean;
  sendingMessage: boolean;
}

const GameActionsPanel: React.FC<GameActionsPanelProps> = ({
  isOpen,
  onClose,
  onGameAction,
  showDiceRoller,
  onToggleDiceRoller,
  customDice,
  setCustomDice,
  diceReason,
  setDiceReason,
  onRollDice,
  onCustomDiceRoll,
  rollingDice,
  sendingMessage
}) => {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <h2 className="text-xl font-bold">Game Actions</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-indigo-200 transition-colors"
            aria-label="Close panel"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Game Action Buttons */}
          <div>
            <h3 className="font-semibold mb-3">Actions</h3>
            <div className="space-y-2">
              <button 
                onClick={() => onGameAction('skill_check')}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                disabled={sendingMessage}
              >
                Skill Check
              </button>
              <button 
                onClick={() => onGameAction('combat_action')}
                className="w-full bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
                disabled={sendingMessage}
              >
                Combat Action
              </button>
              <button 
                onClick={() => onGameAction('spell')}
                className="w-full bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 transition-colors"
                disabled={sendingMessage}
              >
                Cast Spell
              </button>
              <button 
                onClick={() => onGameAction('investigate')}
                className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
                disabled={sendingMessage}
              >
                Investigate
              </button>
              <button 
                onClick={() => onGameAction('action')}
                className="w-full bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
                disabled={sendingMessage}
              >
                Custom Action
              </button>
              <button 
                onClick={onToggleDiceRoller}
                className="w-full bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 transition-colors"
                disabled={sendingMessage}
              >
                {showDiceRoller ? 'Hide Dice Roller' : 'Show Dice Roller'}
              </button>
            </div>
          </div>

          {/* Dice Roller */}
          {showDiceRoller && (
            <div className="bg-gray-100 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Dice Roller</h3>
              
              {/* Dice presets */}
              <div className="mb-3">
                <p className="text-sm mb-1">Quick Roll:</p>
                <div className="flex flex-wrap gap-2">
                  {DICE_PRESETS.map((dice, index) => (
                    <button
                      key={index}
                      onClick={() => onRollDice(dice.notation)}
                      className="bg-indigo-500 text-white px-3 py-1 rounded text-sm hover:bg-indigo-600 transition-colors"
                      disabled={rollingDice}
                    >
                      {dice.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Custom dice form */}
              <form onSubmit={onCustomDiceRoll} className="space-y-2">
                <div>
                  <label htmlFor="customDice" className="block text-sm mb-1">
                    Custom Roll (e.g., d20, 2d6, d8+3):
                  </label>
                  <input
                    id="customDice"
                    type="text"
                    value={customDice}
                    onChange={(e) => setCustomDice(e.target.value)}
                    placeholder="Enter dice notation"
                    className="w-full px-3 py-2 border rounded"
                    disabled={rollingDice}
                  />
                </div>
                <div>
                  <label htmlFor="diceReason" className="block text-sm mb-1">
                    Reason (optional):
                  </label>
                  <input
                    id="diceReason"
                    type="text"
                    value={diceReason}
                    onChange={(e) => setDiceReason(e.target.value)}
                    placeholder="E.g., Stealth Check, Attack Roll"
                    className="w-full px-3 py-2 border rounded"
                    disabled={rollingDice}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600 transition-colors"
                  disabled={rollingDice || !customDice.trim()}
                >
                  {rollingDice ? 'Rolling...' : 'Roll Dice'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default GameActionsPanel;

