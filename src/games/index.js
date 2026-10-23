import path from 'node:path';import config from '../config/config.js';import {Games} from './engine.js';
export const games=new Games(path.join(config.paths.data,'game-scores.json'));
