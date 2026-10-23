import {battle} from './battle.js';import base from '../brain/trivia.js';export default battle('teamquiz',level=>base.create(level),{players:8,minPlayers:4,teams:true});
