import path from 'node:path';import config from '../config/config.js';import {GameSessionManager} from './GameSessionManager.js';import {GameProgression} from './progression.js';import {GameEngine} from './GameEngine.js';import {MultiplayerGameManager} from './MultiplayerGameManager.js';import {brainModules} from './brain/index.js';import {multiplayerModules} from './multiplayer/index.js';
export const progression=new GameProgression(path.join(config.paths.data,'game-profiles.json'));
export const sessions=new GameSessionManager({onExpire:s=>{(s.kind==='brain'?engine.expire(s):multiplayer.expire(s)).catch(()=>{});}});
export const engine=new GameEngine({sessions,progression,brain:brainModules});
export const multiplayer=new MultiplayerGameManager({sessions,progression,modules:multiplayerModules});
