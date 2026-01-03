import React from 'react';
import { Character } from '../../types/character';
import { characterService } from '../../services/characterService';

interface CharacterSheetPanelProps {
  character: Character | null;
  isOpen: boolean;
  onClose: () => void;
  onCharacterUpdate?: (character: Character) => void;
}

const CharacterSheetPanel: React.FC<CharacterSheetPanelProps> = ({
  character,
  isOpen,
  onClose,
  onCharacterUpdate
}) => {
  // Handle equipment toggle
  const handleToggleEquipment = async (equipmentId: string | undefined) => {
    if (!character?.id || !equipmentId) return;

    try {
      await characterService.toggleEquipment(character.id, equipmentId);
      // Reload character data
      const updatedCharacter = await characterService.getCharacter(character.id);
      if (onCharacterUpdate) {
        onCharacterUpdate(updatedCharacter);
      }
    } catch (error) {
      console.error('Error toggling equipment:', error);
    }
  };

  if (!character) {
    return null;
  }

  // Get equipped items
  const equippedItems = character.equipment?.filter(eq => eq.equipped) || [];
  const inventoryItems = character.equipment?.filter(eq => !eq.equipped) || [];

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
        className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <h2 className="text-xl font-bold">Character Sheet</h2>
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
        <div className="p-6 space-y-6">
          {/* Character Basic Info */}
          <div className="flex items-start space-x-4">
            {/* Character Portrait */}
            {character.portrait && (
              <div className="flex-shrink-0">
                <img
                  src={character.portrait}
                  alt={`${character.name} portrait`}
                  className="w-24 h-24 rounded-lg object-cover border-2 border-indigo-200"
                  onError={(e) => {
                    // Hide image if it fails to load
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            {/* Character Name and Info */}
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2">{character.name}</h3>
              <p className="text-sm text-gray-600">
                Level {character.level} {character.class} {character.race}
              </p>
            </div>
          </div>

          {/* Character Status */}
          {character.status && character.status !== 'alive' && (
            <div className={`p-4 rounded-lg ${
              character.status === 'deceased' 
                ? 'bg-red-100 border-2 border-red-500' 
                : 'bg-yellow-100 border-2 border-yellow-500'
            }`}>
              <h4 className="font-semibold mb-2">
                Status: {character.status === 'unconscious' ? 'Unconscious' : 'Deceased'}
              </h4>
              {character.status === 'unconscious' && (
                <div className="space-y-2">
                  <div className="text-sm">
                    <div className="font-medium mb-1">Death Saving Throws:</div>
                    <div className="flex items-center space-x-4">
                      <div>
                        <span className="text-green-600 font-semibold">
                          Successes: {character.deathSavingThrowSuccesses || 0}/3
                        </span>
                      </div>
                      <div>
                        <span className="text-red-600 font-semibold">
                          Failures: {character.deathSavingThrowFailures || 0}/3
                        </span>
                      </div>
                    </div>
                  </div>
                  {(character.deathSavingThrowSuccesses || 0) >= 3 && (
                    <div className="text-sm text-green-700 font-medium">
                      Stabilized - No longer dying, but still unconscious
                    </div>
                  )}
                </div>
              )}
              {character.status === 'deceased' && (
                <div className="text-sm text-red-700 font-medium">
                  This character has died and cannot be used in future campaigns.
                </div>
              )}
            </div>
          )}

          {/* Hit Points */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">Hit Points</h4>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${
                    character.hitPoints.current === 0 
                      ? 'bg-red-600' 
                      : character.hitPoints.current <= character.hitPoints.maximum * 0.25
                      ? 'bg-red-500'
                      : character.hitPoints.current <= character.hitPoints.maximum * 0.5
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.max(0, (character.hitPoints.current / character.hitPoints.maximum) * 100)}%`
                  }}
                />
              </div>
              <span className="text-sm font-medium">
                {character.hitPoints.current} / {character.hitPoints.maximum}
              </span>
            </div>
          </div>

          {/* Stats Grid */}
          <div>
            <h4 className="font-semibold mb-3">Ability Scores</h4>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(character.abilities).map(([ability, data]) => (
                <div
                  key={ability}
                  className="bg-gray-50 p-3 rounded-lg text-center"
                >
                  <div className="text-xs text-gray-600 uppercase mb-1">
                    {ability.substring(0, 3)}
                  </div>
                  <div className="text-2xl font-bold">{data.score}</div>
                  <div className="text-sm text-gray-600">
                    {data.modifier >= 0 ? '+' : ''}
                    {data.modifier}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Other Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-600 uppercase mb-1">Armor Class</div>
              <div className="text-2xl font-bold">{character.armorClass}</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-600 uppercase mb-1">Speed</div>
              <div className="text-2xl font-bold">{character.speed} ft</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-600 uppercase mb-1">Proficiency Bonus</div>
              <div className="text-2xl font-bold">
                +{character.proficiencyBonus}
              </div>
            </div>
          </div>

          {/* Proficiencies */}
          {character.proficiencies && character.proficiencies.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Proficiencies</h4>
              <div className="space-y-2">
                {['skills', 'savingThrows', 'tools', 'languages'].map(type => {
                  const items = character.proficiencies?.filter(p => p.type === type) || [];
                  if (items.length === 0) return null;
                  return (
                    <div key={type} className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-600 uppercase mb-1">
                        {type.replace(/([A-Z])/g, ' $1').trim()}
                      </div>
                      <div className="text-sm">
                        {items.map(p => p.name).join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Equipped Items */}
          {equippedItems.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Equipped Items</h4>
              <div className="space-y-2">
                {equippedItems.map((item) => (
                  <div
                    key={item.id || item.item}
                    className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm">{item.item}</div>
                      {item.quantity > 1 && (
                        <div className="text-xs text-gray-600">Qty: {item.quantity}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleEquipment(item.id)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      Unequip
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inventory */}
          <div>
            <h4 className="font-semibold mb-2">Inventory</h4>
            {inventoryItems.length > 0 ? (
              <div className="space-y-2">
                {inventoryItems.map((item) => (
                  <div
                    key={item.id || item.item}
                    className="bg-gray-50 border border-gray-200 p-3 rounded-lg flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm">{item.item}</div>
                      {item.quantity > 1 && (
                        <div className="text-xs text-gray-600">Qty: {item.quantity}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleEquipment(item.id)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      Equip
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No items in inventory</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CharacterSheetPanel;

