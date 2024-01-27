const file = require('../data/remote/Level.sav.json');
const { traverseStructure } = require('./working');

const levelData = file.root.properties.worldSaveData.Struct.value.Struct;

const characterData = levelData.CharacterSaveParameterMap;
const characterContainers = levelData.CharacterContainerSaveData;
const groupData = levelData.GroupSaveDataMap;

const characterDataDeserialized = findAndUnpackRawData(characterData);
console.log(characterDataDeserialized)
const characterContainersDeserialized = findAndUnpackRawData(characterContainers);
console.log(characterContainersDeserialized)

function fromMap(data) {
    return {
        Map: {
            ...data.Map,
            value: data.Map.value.reduce((acc, curr) => {
                const rawData = curr.value.Struct.Struct.RawData.Array.value.Base;
                const res = {};
                traverseStructure(Buffer.from(rawData.Byte.Byte), undefined, res);

                acc.push({
                    key: curr.key,
                    value: {
                        Struct: {
                            Struct: res
                        }
                    }
                })
                return acc;
            }, []),
        },
    }
}

function findAndUnpackRawData(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return;
    }

    Object.keys(obj).forEach(key => {
        if (key === 'RawData' && obj[key].Array && obj[key].Array.value.Base.Byte) {
            // Assuming traverseStructure is a function that takes a buffer and returns processed data
            obj[key].Array.value.Base.Byte = traverseStructure(Buffer.from(obj[key].Array.value.Base.Byte.Byte));
        } else {
            findAndUnpackRawData(obj[key]);
        }
    });
}