import React from 'react';
import CharacterCreationForm from '../components/character/CharacterCreationForm';

const CharacterCreation: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto">
        <CharacterCreationForm />
      </div>
    </div>
  );
};

export default CharacterCreation; 