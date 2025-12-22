import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Character, 
  CharacterClass, 
  CharacterRace, 
  CHARACTER_RACES, 
  CHARACTER_CLASSES 
} from '../../types/character';
import { characterService } from '../../services/characterService';

const ABILITY_ORDER = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

type AbilityKey = typeof ABILITY_ORDER[number];

const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

const DEFAULT_POINT_BUY_SCORES: Record<AbilityKey, number> = {
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
};

const CLASS_ABILITY_PRIORITIES: Record<CharacterClass, AbilityKey[]> = {
  Barbarian: ['strength', 'constitution'],
  Bard: ['charisma', 'dexterity'],
  Cleric: ['wisdom', 'strength'],
  Druid: ['wisdom', 'constitution'],
  Fighter: ['strength', 'constitution'],
  Monk: ['dexterity', 'wisdom'],
  Paladin: ['strength', 'charisma'],
  Ranger: ['dexterity', 'wisdom'],
  Rogue: ['dexterity', 'intelligence'],
  Sorcerer: ['charisma', 'constitution'],
  Warlock: ['charisma', 'constitution'],
  Wizard: ['intelligence', 'constitution'],
};

const RACE_ABILITY_BONUSES: Record<CharacterRace, Partial<Record<AbilityKey, number>>> = {
  Dragonborn: { strength: 2, charisma: 1 },
  Dwarf: { constitution: 2 },
  Elf: { dexterity: 2 },
  Gnome: { intelligence: 2 },
  'Half-Elf': { charisma: 2 },
  'Half-Orc': { strength: 2, constitution: 1 },
  Halfling: { dexterity: 2 },
  Human: {
    strength: 1,
    dexterity: 1,
    constitution: 1,
    intelligence: 1,
    wisdom: 1,
    charisma: 1,
  },
  Tiefling: { charisma: 2, intelligence: 1 },
};

const initialCharacter: Omit<Character, 'id' | 'abilities'> = {
  name: '',
  portrait: null,
  race: 'Human',
  class: 'Fighter',
  level: 1,
  background: '',
  alignment: 'True Neutral',
  experience: 0,
  hitPoints: {
    maximum: 10,
    current: 10,
  },
  armorClass: 10,
  speed: 30,
  proficiencyBonus: 2,
  backstory: '',
};

const CharacterCreationForm: React.FC = () => {
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Omit<Character, 'id' | 'abilities'>>(initialCharacter);
  const [abilityScores, setAbilityScores] = useState<Record<AbilityKey, number>>(DEFAULT_POINT_BUY_SCORES);
  const [halfElfBonuses, setHalfElfBonuses] = useState<AbilityKey[]>(['strength', 'dexterity']);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const portraitInputRef = useRef<HTMLInputElement | null>(null);

  const calculateModifier = (score: number): number => {
    return Math.floor((score - 10) / 2);
  };

  const raceBonuses = useMemo(() => {
    const baseBonuses = RACE_ABILITY_BONUSES[character.race] ?? {};
    if (character.race !== 'Half-Elf') {
      return baseBonuses;
    }

    const [first, second] = halfElfBonuses;
    return {
      ...baseBonuses,
      [first]: (baseBonuses[first] ?? 0) + 1,
      [second]: (baseBonuses[second] ?? 0) + 1,
    };
  }, [character.race, halfElfBonuses]);

  const pointsUsed = useMemo(() => {
    return ABILITY_ORDER.reduce((total, ability) => total + (POINT_BUY_COST[abilityScores[ability]] ?? 0), 0);
  }, [abilityScores]);

  const pointsRemaining = 27 - pointsUsed;

  const totalScores = useMemo(() => {
    return ABILITY_ORDER.reduce<Record<AbilityKey, number>>((acc, ability) => {
      acc[ability] = abilityScores[ability] + (raceBonuses[ability] ?? 0);
      return acc;
    }, { ...abilityScores });
  }, [abilityScores, raceBonuses]);

  const abilitiesPayload = useMemo(() => {
    return ABILITY_ORDER.reduce<Character['abilities']>((acc, ability) => {
      const score = totalScores[ability];
      acc[ability] = { score, modifier: calculateModifier(score) };
      return acc;
    }, {} as Character['abilities']);
  }, [totalScores]);

  const adjustAbilityScore = (ability: AbilityKey, delta: number) => {
    setAbilityScores(prev => {
      const current = prev[ability];
      const next = Math.min(15, Math.max(8, current + delta));
      if (next === current) {
        return prev;
      }

      const nextScores = { ...prev, [ability]: next };
      const nextPointsUsed = ABILITY_ORDER.reduce(
        (total, key) => total + (POINT_BUY_COST[nextScores[key]] ?? 0),
        0,
      );

      if (nextPointsUsed > 27) {
        return prev;
      }

      return nextScores;
    });
  };

  const buildSuggestedScores = () => {
    const priorities = CLASS_ABILITY_PRIORITIES[character.class] ?? [];
    const raceBonusAbilities = ABILITY_ORDER.filter(ability => (raceBonuses[ability] ?? 0) > 0);
    const allocationOrder = Array.from(
      new Set<AbilityKey>([...priorities, ...raceBonusAbilities, ...ABILITY_ORDER]),
    );
    const desiredScores = [15, 14, 13, 12, 10, 8];

    return allocationOrder.reduce<Record<AbilityKey, number>>((acc, ability, index) => {
      acc[ability] = desiredScores[index] ?? 8;
      return acc;
    }, { ...DEFAULT_POINT_BUY_SCORES });
  };

  const handleSuggestedAllocation = () => {
    setAbilityScores(buildSuggestedScores());
  };

  const handlePortraitClick = () => {
    portraitInputRef.current?.click();
  };

  const handlePortraitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCharacter(prev => ({
        ...prev,
        portrait: typeof reader.result === 'string' ? reader.result : prev.portrait,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await characterService.createCharacter({
        ...character,
        abilities: abilitiesPayload,
      });
      navigate('/characters'); // Redirect to character list after creation
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create character');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create Your Character</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:row-span-2">
            <label className="block text-sm font-medium text-gray-700">Portrait</label>
            <div
              role="button"
              tabIndex={0}
              onClick={handlePortraitClick}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handlePortraitClick();
                }
              }}
              className="mt-1 flex w-full items-center justify-center rounded-md border-2 border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500 hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ aspectRatio: '3 / 4' }}
            >
              {character.portrait ? (
                <img
                  src={character.portrait}
                  alt="Character portrait preview"
                  className="h-full w-full rounded-md object-cover"
                />
              ) : (
                <span className="px-4 text-center">Click empty space to upload a portrait (3:4)</span>
              )}
            </div>
            <input
              ref={portraitInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePortraitChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={character.name}
              onChange={(e) => setCharacter(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Race</label>
            <select
              value={character.race}
              onChange={(e) => setCharacter(prev => ({ ...prev, race: e.target.value as CharacterRace }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              {CHARACTER_RACES.map((race) => (
                <option key={race} value={race}>{race}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Class</label>
            <select
              value={character.class}
              onChange={(e) => setCharacter(prev => ({ ...prev, class: e.target.value as CharacterClass }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              {CHARACTER_CLASSES.map((charClass) => (
                <option key={charClass} value={charClass}>{charClass}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Level</label>
            <input
              type="number"
              min="1"
              max="20"
              value={character.level}
              onChange={(e) => setCharacter(prev => ({ ...prev, level: parseInt(e.target.value) }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Ability Scores */}
        <div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-semibold">Ability Scores</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">Point Buy:</span>
              <span>27 points to spend (scores 8-15 before racial bonuses).</span>
              <span className={pointsRemaining < 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                {pointsRemaining} points remaining
              </span>
              <button
                type="button"
                onClick={handleSuggestedAllocation}
                className="rounded-md border border-indigo-200 px-2 py-1 text-indigo-700 hover:bg-indigo-50"
              >
                Use class + race suggestion
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <div className="font-medium">Class ability priorities</div>
              <div className="mt-1">
                {CLASS_ABILITY_PRIORITIES[character.class]?.map((ability) => ability[0].toUpperCase() + ability.slice(1)).join(', ')}
              </div>
              <div className="mt-3 font-medium">Race ability bonuses</div>
              <div className="mt-1">
                {ABILITY_ORDER.filter((ability) => (raceBonuses[ability] ?? 0) > 0)
                  .map((ability) => `+${raceBonuses[ability]} ${ability[0].toUpperCase() + ability.slice(1)}`)
                  .join(', ') || 'None'}
              </div>
              {character.race === 'Half-Elf' && (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <label className="flex flex-col text-sm text-gray-700">
                    Bonus choice 1 (+1)
                    <select
                      value={halfElfBonuses[0]}
                      onChange={(e) =>
                        setHalfElfBonuses((prev) => [e.target.value as AbilityKey, prev[1]])
                      }
                      className="mt-1 rounded-md border-gray-300"
                    >
                      {ABILITY_ORDER.filter((ability) => ability !== 'charisma').map((ability) => (
                        <option
                          key={ability}
                          value={ability}
                          disabled={halfElfBonuses[1] === ability}
                        >
                          {ability[0].toUpperCase() + ability.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col text-sm text-gray-700">
                    Bonus choice 2 (+1)
                    <select
                      value={halfElfBonuses[1]}
                      onChange={(e) =>
                        setHalfElfBonuses((prev) => [prev[0], e.target.value as AbilityKey])
                      }
                      className="mt-1 rounded-md border-gray-300"
                    >
                      {ABILITY_ORDER.filter((ability) => ability !== 'charisma').map((ability) => (
                        <option
                          key={ability}
                          value={ability}
                          disabled={halfElfBonuses[0] === ability}
                        >
                          {ability[0].toUpperCase() + ability.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {ABILITY_ORDER.map((ability) => {
                const baseScore = abilityScores[ability];
                const racialBonus = raceBonuses[ability] ?? 0;
                const totalScore = totalScores[ability];
                const modifier = calculateModifier(totalScore);
                const canIncrease = baseScore < 15;
                const canDecrease = baseScore > 8;
                const nextCost = POINT_BUY_COST[baseScore + 1] ?? POINT_BUY_COST[baseScore];
                const currentCost = POINT_BUY_COST[baseScore] ?? 0;
                const costDelta = nextCost - currentCost;
                const canAffordIncrease = pointsRemaining - costDelta >= 0;

                return (
                  <div key={ability} className="rounded-md border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-700 capitalize">{ability}</div>
                        <div className="text-xs text-gray-500">Modifier: {modifier >= 0 ? `+${modifier}` : modifier}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjustAbilityScore(ability, -1)}
                          disabled={!canDecrease}
                          className="h-8 w-8 rounded-md border border-gray-300 text-lg font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          -
                        </button>
                        <div className="text-center">
                          <div className="text-sm text-gray-500">Base</div>
                          <div className="text-lg font-semibold text-gray-900">{baseScore}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => adjustAbilityScore(ability, 1)}
                          disabled={!canIncrease || !canAffordIncrease}
                          className="h-8 w-8 rounded-md border border-gray-300 text-lg font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
                      <span>Racial Bonus</span>
                      <span>{racialBonus >= 0 ? `+${racialBonus}` : racialBonus}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm font-semibold text-gray-800">
                      <span>Total Score</span>
                      <span>{totalScore}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Backstory */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Backstory</label>
          <textarea
            value={character.backstory}
            onChange={(e) => setCharacter(prev => ({ ...prev, backstory: e.target.value }))}
            rows={4}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Character'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CharacterCreationForm; 
