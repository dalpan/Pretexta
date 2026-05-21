// MongoDB initialization script
db = db.getSiblingDB('Pretexta');

// Create collections
db.createCollection('users');
db.createCollection('challenges');
db.createCollection('quizzes');
db.createCollection('simulations');
db.createCollection('llm_configs');
db.createCollection('settings');

// Create indexes
db.users.createIndex({ username: 1 }, { unique: true });
db.challenges.createIndex({ id: 1 }, { unique: true });
db.quizzes.createIndex({ id: 1 }, { unique: true });
db.simulations.createIndex({ id: 1 }, { unique: true });
db.llm_configs.createIndex({ provider: 1 }, { unique: true });

print('Pretexta database initialized successfully!');