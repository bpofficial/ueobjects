const file = require('../data/remote/Level.sav.json');
const _ = require('lodash')
const fs = require('fs')

// const worldSaveData = file.root.properties.worldSaveData.Struct.value.Struct;
// const characterData = worldSaveData['CharacterSaveParameterMap'].Map.value;
// const bufferData = Buffer.from(characterData[0].value.Struct.Struct.RawData.Array.value.Base.Byte.Byte);

// fs.writeFileSync('../data/characterData/wip.sav', bufferData);

// const players = characterData.reduce((acc, curr) => {
//     const playerId = curr.key.Struct.Struct.PlayerUId.Struct.value.Guid;
//     const rawData = curr.value.Struct.Struct.RawData.Array.value.Base;
//     const res = {};
//     traverseStructure(Buffer.from(rawData.Byte.Byte), undefined, res);

//     acc.set(playerId, res)
//     return acc;
// }, new Map())


// const res = {};
// traverseStructure(bufferData, undefined, res);
// fs.writeFileSync(`./characterData/wip.json`, Buffer.from(JSON.stringify(res, null, 4)))

// console.log(players)

/**
 * @param buffer {Buffer}
 * @param offset {{value: number}}
 * @param result {Record<string, any>}
 */
function traverseStructure(buffer, offset = { value: 0 }, result = {}) {
    let keyStack = [];

    let lastValue;
    while (offset.value < buffer.length) {
        const name = readPropertyName(buffer, offset);
        lastValue = name;

        if (name === 'None') return { None: result };

        if (isPropertyType(name)) {
            let value;
            const preKey = name.replace('Property', '');

            switch (name) {
                case 'StructProperty':
                    value = readStructProperty(buffer, offset)
                    break;
                case 'ArrayProperty':
                    value = readArrayProperty(buffer, offset);
                    break;
                case 'IntProperty':
                    value = readIntProperty(buffer, offset);
                    break;
                case 'Int64Property':
                    value = readInt64Property(buffer, offset);
                    break;
                case 'FloatProperty':
                    value = readFloatProperty(buffer, offset);
                    break;
                case 'BoolProperty':
                    value = readBoolProperty(buffer, offset);
                    break;
                case 'EnumProperty':
                    value = readEnumProperty(buffer, offset);
                    break;
                case 'StrProperty':
                    value = readStrProperty(buffer, offset);
                    break;
                case 'NameProperty':
                    value = readNameProperty(buffer, offset);
                    break;
            }

            const isNone = value && typeof value === 'object' && 'None' in value;
            if (isNone) value = value.None;

            _.set(result, [...keyStack, preKey].join('.') , value);
            keyStack.pop();

            if (isNone && name !== 'StructProperty') {
                return {None: result};
            }
            lastValue = result;
        } else {
            keyStack.push(name);
        }
    }

    if (Object.keys(result).length === 0 && lastValue) return lastValue;
    return result;
}

function isPropertyType(type) {
    switch (type) {
        case "Int8Property":
        case "Int16Property":
        case "IntProperty":
        case "Int64Property":
        case "UInt8Property":
        case "UInt16Property":
        case "UInt32Property":
        case "UInt64Property":
        case "FloatProperty":
        case "DoubleProperty":
        case "BoolProperty":
        case "ByteProperty":
        case "EnumProperty":
        case "ArrayProperty":
        case "ObjectProperty":
        case "StrProperty":
        case "FieldPathProperty":
        case "SoftObjectProperty":
        case "NameProperty":
        case "TextProperty":
        case "DelegateProperty":
        case "MulticastDelegateProperty":
        case "MulticastInlineDelegateProperty":
        case "MulticastSparseDelegateProperty":
        case "SetProperty":
        case "MapProperty":
        case "StructProperty":
            return true;
        default:
            return false;
    }
}

function skipEmpty(buffer, offset) {
    while (buffer[offset.value] === 0 && offset.value < buffer.length) {
        offset.value++;
    }
}

function getStructSize(buff, offset) {
    const size = buff.readBigInt64LE(offset.value);
    offset.value += 8 + 1;
    return size;
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 */
function readStructProperty(buff, offset) {
    const size = buff.readBigInt64LE(offset.value);
    offset.value += 8;
    const structKey = readPropertyName(buff, offset);
    const guid = readGuid(buff, offset);
    offset.value++;

    if (structKey === 'Vector') {
        const xValue = buff.readDoubleLE(offset.value);
        offset.value += 8;
        const yValue = buff.readDoubleLE(offset.value)
        offset.value += 8;
        const zValue = buff.readDoubleLE(offset.value);
        offset.value += 8;

        return {
            Struct: {
                value: {
                    Vector: {
                        x: xValue,
                        y: yValue,
                        z: zValue
                    }
                },
                struct_type: "Vector",
                struct_id: guid
            }
        }
    }

    const subStructure = buff.subarray(offset.value);

    const subOffset = { value: 0 }
    let result = traverseStructure(subStructure, subOffset);
    if (result && typeof result === 'object' && 'None' in result) {
        result = result.None;
    }

    offset.value += subOffset.value;

    return {
        Struct: {
            value: {
                [structKey]: result
            },
            struct_type: {
                Struct: structKey
            },
            struct_id: guid
        }
    }
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 * @param size {number}
 */
function readArrayProperty(buff, offset) {
    const size = buff.readBigInt64LE(offset.value);
    offset.value += 8;
    const _propName = readPropertyName(buff, offset);
    offset.value++;
    const countOfElements = buff.readInt32LE(offset.value)
    offset.value += 4;
    const structName = readPropertyName(buff, offset);
    const _innerStruct = readPropertyName(buff, offset);

    if (_propName === 'StructProperty') {
        const _innerStructSize = buff.readBigInt64LE(offset.value)
        offset.value += 8;
    }

    const innerStructName = readPropertyName(buff, offset);

    let guid;
    if (_propName === 'StructProperty') {
        guid = readGuid(buff, offset);
        buff.readBigInt64LE(offset.value)
        offset.value += 1;
    } else {
        const innerTypeSize = buff.readBigInt64LE(offset.value)
        offset.value += 8;
    }

    // Array to hold the elements
    let elements = [];

    // Iterate over each element in the array
    for (let i = 0; i < countOfElements; i++) {
        // Read each element, this might involve reading its own property name, type, and size

        const elementType = readPropertyName(buff, offset);

        let element = readArrayElement(buff, offset);
        if (element && typeof element === 'object' && 'None' in element) {
            element = element.None;
        }
        elements.push(element);
    }

    return {
        value: {
            Struct: {
                name: _innerStruct,
                struct_type: {
                    Struct: structName
                },
                id: guid,
                value: elements
            }
        },
        array_type: _propName
    }
}

/**
 * Read an element from the array.
 * @param buff {Buffer}
 * @param offset {{value:number}}
 * @returns {any}
 */
function readArrayElement(buff, offset) {
    // Read the metadata for the element (name, type, size, etc.)
    // Then read the actual data of the element
    // The implementation will depend on the structure of your elements
    // For example, if it's a StructProperty, you might call readStructProperty
    // Placeholder implementation
    return traverseStructure(buff, offset);
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 */
function readNameProperty(buff, offset) {
    const size = buff.readBigInt64LE(offset.value)
    offset.value += 9;
    const flags = buff.subarray(offset.value, offset.value + 4)
    offset.value += 5;
    const extra = buff.subarray(offset.value, offset.value + 3);
    offset.value += 3;

    const length = Number(size) - 8;
    const value = buff.subarray(offset.value, offset.value + length).toString('ascii');
    offset.value += length;

    return value.replace('\0', '');
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 * @returns {number}
 */
function readFloatProperty(buff, offset) {
    const bytes = buff.readBigInt64LE(offset.value);
    offset.value += 9;
    const value = buff.readFloatLE(offset.value);
    console.debug(`[Read] Float '${value}'`)
    offset.value += 4;
    return value;
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 */
function readEnumProperty(buff, offset) {
    const enumSize = buff.readBigInt64LE(offset.value)
    offset.value += 8;
    const enumType = readPropertyName(buff, offset);
    offset.value++;
    const enumValue = readPropertyName(buff, offset);
    return enumValue
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 * @returns {boolean}
 */
function readBoolProperty(buff, offset) {
    const empty = buff.readBigInt64LE(offset.value);
    offset.value += 8;
    const value = buff.readUInt8(offset.value) !== 0;
    offset.value += 1;
    console.debug(`[Read] Bool '${!!value}'`)
    return value;
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 * @returns {number}
 */
function readIntProperty(buff, offset) {
    const _size = getStructSize(buff, offset);
    const value = buff.readInt32LE(offset.value);
    offset.value += 4;
    console.debug(`[Read] Int '${value}'`)
    return value;
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 * @returns {number}
 */
function readInt64Property(buff, offset) {
    const bytes = buff.readBigInt64LE(offset.value);
    offset.value += 8;
    const value = buff.readBigInt64LE(offset.value);
    offset.value += 8; // skip size of Int64
    return parseInt(value);
}

function readPropertyName(buff, offset) {
    const length = buff.readInt32LE(offset.value);
    offset.value += 4;
    let value = buff.toString('utf8', offset.value, offset.value + length);
    offset.value += length;
    console.debug(`[Read] String '${value}' (${length}) (hex=${hexString(value)})`)
    return value.replace('\0', '');
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 * @returns {string}
 */
function readStrProperty(buff, offset) {
    const size = buff.readBigInt64LE(offset.value);
    offset.value += 8 + 1;
    const length = buff.readInt32LE(offset.value);
    offset.value += 4;
    let value = buff.toString('utf8', offset.value, offset.value + length);
    offset.value += length;
    console.debug(`[Read] String '${value}' (${length}) (hex=${hexString(value)})`)
    return value.replace('\0', '');
}

/**
 * @param val {Buffer | string}
 */
function hexString(val) {
    return Buffer.from(val).toString('hex')
        .split('')
        .reduce((acc, curr, idx) => {
            if (idx % 2 === 0) {
                acc.push(curr)
            } else {
                acc[acc.length - 1] += curr;
            }
            return acc;
        }, []).join(' ')
}

/**
 * @param buff {Buffer}
 * @param offset {{value:number}}
 * @returns {string}
 */
function readGuid(buff, offset) {
    // Read 16 bytes from the buffer starting at the given offset
    const bytes = buff.subarray(offset.value, offset.value + 16);

    // Convert each byte to a two-character hex string and concatenate them
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

    offset.value += 16;

    // Insert hyphens to format the string as a GUID
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

module.exports = { traverseStructure };