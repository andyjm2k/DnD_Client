import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Character } from '../types/character';
import { characterService } from '../services/characterService';

const CharacterDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (id) {
      loadCharacter(id);
    }
  }, [id]);

  const loadCharacter = async (characterId: string) => {
    try {
      const data = await characterService.getCharacter(characterId);
      setCharacter(data);
    } catch (err) {
      console.error('Error loading character:', err);
      setError('Failed to load character details. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl text-gray-600">Loading character details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
        <p>{error}</p>
        <button 
          onClick={() => navigate('/characters')}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Back to Characters
        </button>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold mb-4">Character Not Found</h2>
        <Link
          to="/characters"
          className="text-blue-500 hover:text-blue-600"
        >
          Back to Characters
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {character.portrait ? (
            <img
              src={character.portrait}
              alt={`${character.name} portrait`}
              className="h-20 w-16 rounded-md object-cover shadow"
            />
          ) : (
            <div className="h-20 w-16 rounded-md bg-gray-100 flex items-center justify-center text-xs text-gray-400">
              No portrait
            </div>
          )}
          <h1 className="text-3xl font-bold">{character.name}</h1>
        </div>
        <Link
          to="/characters"
          className="text-blue-500 hover:text-blue-600"
        >
          Back to Characters
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Info */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
            <div className="space-y-2">
              <p><span className="font-medium">Race:</span> {character.race}</p>
              <p><span className="font-medium">Class:</span> {character.class}</p>
              <p><span className="font-medium">Level:</span> {character.level}</p>
              <p><span className="font-medium">Background:</span> {character.background}</p>
              <p><span className="font-medium">Alignment:</span> {character.alignment}</p>
              <p><span className="font-medium">Experience:</span> {character.experience}</p>
            </div>
          </div>

          {/* Combat Stats */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Combat Statistics</h2>
            <div className="space-y-2">
              <p><span className="font-medium">Hit Points:</span> {character.hitPoints.current}/{character.hitPoints.maximum}</p>
              <p><span className="font-medium">Armor Class:</span> {character.armorClass}</p>
              <p><span className="font-medium">Speed:</span> {character.speed} ft.</p>
              <p><span className="font-medium">Proficiency Bonus:</span> +{character.proficiencyBonus}</p>
            </div>
          </div>

          {/* Abilities */}
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Ability Scores</h2>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {Object.entries(character.abilities).map(([ability, { score, modifier }]) => (
                <div key={ability} className="text-center p-3 bg-gray-50 rounded">
                  <div className="font-medium capitalize">{ability}</div>
                  <div className="text-xl">{score}</div>
                  <div className="text-sm text-gray-600">{modifier >= 0 ? `+${modifier}` : modifier}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Backstory */}
          {character.backstory && (
            <div className="md:col-span-2">
              <h2 className="text-xl font-semibold mb-4">Backstory</h2>
              <div className="bg-gray-50 p-4 rounded">
                <p className="whitespace-pre-wrap">{character.backstory}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CharacterDetails; 
