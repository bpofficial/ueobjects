import {traverse} from "./lib";
import * as fs from 'fs';
import {Context} from "./context";

const file = require('../remote/Level.sav.json');
const worldSaveData = file.root.properties.worldSaveData.Struct.value.Struct;
const characterData = worldSaveData['CharacterSaveParameterMap'].Map.value;
const bufferData = Buffer.from(characterData[0].value.Struct.Struct.RawData.Array.value.Base.Byte.Byte);

fs.writeFileSync('../data/characterData/wip.sav', bufferData);

const ctx = new Context(bufferData);
const result = traverse(ctx);
console.log(result);