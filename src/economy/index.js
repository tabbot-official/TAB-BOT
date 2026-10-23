import path from 'node:path';import config from '../config/config.js';import {Economy} from './store.js';export const economy=new Economy(path.join(config.paths.data,'economy.json'));
