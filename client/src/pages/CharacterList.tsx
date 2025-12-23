import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Character } from '../types/character';
import { characterService } from '../services/characterService';

const CharacterList: React.FC = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string>('');

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      setError('');
      const data = await characterService.getCharacters();
      console.log('Server response:', data);
      setCharacters(data);
    } catch (err) {
      console.error('Error loading characters:', err);
      setError('Failed to load characters. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this character?')) {
      return;
    }

    try {
      setDeleteError('');
      await characterService.deleteCharacter(id);
      setCharacters(prevCharacters => prevCharacters.filter(char => char.id !== id));
    } catch (err: any) {
      console.error('Error deleting character:', err);
      const errorMessage = err.response?.data?.error || 
        'Failed to delete character. The character might be referenced in other game data. Please try again later.';
      setDeleteError(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl text-gray-600">Loading characters...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
        <p>{error}</p>
        <button 
          onClick={() => { setError(''); loadCharacters(); }}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!characters || characters.length === 0) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold mb-4">No Characters Yet</h2>
        <p className="text-gray-600 mb-8">Create your first character to begin your adventure!</p>
        <Link
          to="/characters/create"
          className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Create Character
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {deleteError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <p>{deleteError}</p>
          <button 
            onClick={() => setDeleteError('')}
            className="absolute top-0 right-0 p-4"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Your Characters</h2>
        <Link
          to="/characters/create"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
        >
          Create New Character
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {characters.map((character) => (
          <div
            key={character.id}
            className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
          >
            <div className="h-48 bg-gray-100 flex items-center justify-center">
              {character.portrait ? (
                <img
                  src={character.portrait}
                  alt={`${character.name} portrait`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-gray-400 text-sm">No portrait available</span>
              )}
            </div>
            <div className="p-6">
              <h3 className="text-xl font-bold mb-2">{character.name}</h3>
              <div className="text-gray-600 space-y-1">
                <p>Level {character.level || 1} {character.race} {character.class}</p>
                <p>HP: {character.hitPoints?.current || 0}/{character.hitPoints?.maximum || 0}</p>
                <p>AC: {character.armorClass || 10}</p>
              </div>
              <div className="mt-4 space-x-2">
                <Link
                  to={`/characters/${character.id}`}
                  className="inline-block bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-600 transition-colors"
                >
                  View Details
                </Link>
                <button
                  onClick={() => character.id && handleDelete(character.id)}
                  className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CharacterList; 
