import {Context} from './context'
import _ from "lodash";

interface PropertyMethods<T> {
    read(): T;
    write(val: T): void;
}

class Property<T> {
    constructor(protected readonly ctx: Context) {
        // hi
    }

    getStructSize() {
        const size = Int64Property.read(this.ctx);
        this.ctx.skipEmpty();
        return size;
    }
}

interface NestedStructure<T> {
    [k: string]: NestedStructure<T> | Property<T> | { None: NestedStructure<T> | Property<T> }
    /** @ts-ignore */
    None?: NestedStructure<T> | Property<T>;
}

class IntProperty extends Property<number> implements PropertyMethods<number> {
    read() {
        this.getStructSize();
        const value = this.ctx.buffer.readInt32LE(this.ctx.offset);
        this.ctx.offset += 4;
        console.debug(`[Read] Int '${value}'`)
        return value;
    }

    write(val: number) {
        //
    }

    public static read(ctx: Context) {
        return new IntProperty(ctx).read();
    }

    public static write(val: number, ctx: Context) {
        return new IntProperty(ctx).write(val);
    }
}

class Int64Property extends Property<number> implements PropertyMethods<number> {
    read(): number {
        const value = this.ctx.buffer.readBigInt64LE(this.ctx.offset);
        this.ctx.offset += 8;
        console.debug(`[Read] Int64 '${value}'`)
        return parseInt(value.toString());
    }

    write(val: number) {
        //
    }

    public static read(ctx: Context) {
        return new Int64Property(ctx).read();
    }

    public static write(val: number, ctx: Context) {
        return new Int64Property(ctx).write(val);
    }
}

class StrProperty extends Property<string> implements PropertyMethods<string>{
    read(): string {
        const length = this.ctx.buffer.readInt32LE(this.ctx.offset);
        this.ctx.offset += 4;
        this.ctx.skipEmpty();
        let value = this.ctx.buffer.toString('utf8', this.ctx.offset, this.ctx.offset + length);
        this.ctx.offset += length;
        console.debug(`[Read] String '${value}' (${length}) (hex=${hexString(value)})`)
        return value.replace('\0', '');
    }

    write(val: string) {
    }

    public static read(ctx: Context) {
        return new StrProperty(ctx).read();
    }

    public static write(val: string, ctx: Context) {
        return new StrProperty(ctx).write(val);
    }
}

class BoolProperty extends Property<boolean> implements PropertyMethods<boolean>{
    read(): boolean {
        const value = this.ctx.buffer.readUInt8(this.ctx.offset) !== 0;
        this.ctx.offset += 1;
        console.debug(`[Read] Bool '${!!value}'`)
        return value;
    }

    write(val: boolean) {
        //
    }

    public static read(ctx: Context) {
        return new BoolProperty(ctx).read();
    }

    public static write(val: boolean, ctx: Context) {
        return new BoolProperty(ctx).write(val);
    }
}

class FloatProperty extends Property<number> implements PropertyMethods<number>{
    read(): number {
        const value = this.ctx.buffer.readFloatLE(this.ctx.offset);
        console.debug(`[Read] Float '${value}'`)
        this.ctx.offset += 4;
        return value;
    }

    write(val: number) {
        //
    }

    public static read(ctx: Context) {
        return new FloatProperty(ctx).read();
    }

    public static write(val: number, ctx: Context): void {
        return new FloatProperty(ctx).write(val);
    }
}

class EnumProperty<P, T extends NestedStructure<P>> extends Property<T> implements PropertyMethods<T> {
    read(): T {
        const enumName = StrProperty.read(this.ctx);
        const value = StructProperty.read<P>(this.ctx);
        return { [enumName]: value } as T
    }

    write(val: T) {
        //
    }

    public static read<P>(ctx: Context) {
        return new EnumProperty<P, NestedStructure<P>>(ctx).read();
    }

    public static write<P>(val: NestedStructure<P>, ctx: Context): void {
        return new EnumProperty<P, typeof val>(ctx).write(val);
    }
}

class StructProperty<P, T extends NestedStructure<P>> extends Property<T> implements PropertyMethods<T> {
    read(): T {
        const size = this.getStructSize();
        const subStructure = this.ctx.buffer.subarray(this.ctx.offset);
        const subCtx = new Context(subStructure);
        const result = traverse(subCtx) as T;
        this.ctx.offset += subCtx.offset;
        return result;
    }

    write(val: T) {
        //
    }

    public static read<P>(ctx: Context) {
        return new StructProperty<P, NestedStructure<P>>(ctx).read();
    }

    public static write<P>(val: NestedStructure<P>, ctx: Context): void {
        return new StructProperty<P, typeof val>(ctx).write(val);
    }
}

class ArrayProperty<T extends Record<string, Record<string, Property<unknown>[]>>> extends Property<any> implements PropertyMethods<Record<string, Record<string, Property<unknown>[]>>> {
    read(): T {
        const size = this.getStructSize();
        const _propName = StrProperty.read(this.ctx);
        this.ctx.offset++;
        const countOfElements = IntProperty.read(this.ctx);
        const structName = StrProperty.read(this.ctx);
        const _innerStruct = StrProperty.read(this.ctx);
        const _innerStructSize = Int64Property.read(this.ctx);
        const innerStructName = StrProperty.read(this.ctx);

        // Array to hold the elements
        let elements = [];

        // Iterate over each element in the array
        for (let i = 0; i < countOfElements; i++) {
            // Read each element, this might involve reading its own property name, type, and size
            let element = traverse(this.ctx);
            if (element && typeof element === 'object' && 'None' in element) {
                element = element.None as NestedStructure<any>;
            }
            elements.push(element);
        }

        return {
            [structName]: {
                [innerStructName]: elements
            }
        } as unknown as T
    }

    write(val: T) {
        //
    }

    public static read<T extends Record<string, Record<string, Property<unknown>[]>>>(ctx: Context) {
        return new ArrayProperty<T>(ctx).read();
    }

    public static write<T extends Record<string, Record<string, Property<unknown>[]>>>(val: T, ctx: Context) {
        return new ArrayProperty<T>(ctx).write(val);
    }
}
/**
 * Helper functions and logging
 */

export function traverse<T extends NestedStructure<any>>(ctx: Context, result: T = {} as T) {
    let keyStack = [];
    while (ctx.offset < ctx.buffer.length) {

        ctx.skipEmpty();

        const name = StrProperty.read(ctx);
        if (name === 'None') return { None: result };

        if (isPropertyType(name)) {
            let value = readStructProperty(name, ctx);
            const preKey = name.replace('Property', '');

            let isNone = false;
            if (value && typeof value === 'object') {
                if ('None' in value) {
                    value = value.None as NestedStructure<any>;
                    isNone = true;
                }
            }

            _.set(result, [...keyStack, preKey].join('.') , value);
            keyStack.pop();

            if (isNone && name !== 'StructProperty') {
                return {None: result};
            }
        } else {
            keyStack.push(name);
        }
    }
    return result;
}

function readStructProperty(type: string, ctx: Context) {
    switch (type) {
        case "IntProperty":
            return IntProperty.read(ctx);
        case "Int64Property":
            return Int64Property.read(ctx);
        case "FloatProperty":
            return FloatProperty.read(ctx);
        case "BoolProperty":
            return BoolProperty.read(ctx);
        case "EnumProperty":
            return EnumProperty.read(ctx);
        case "StrProperty":
            return StrProperty.read(ctx);
        case "StructProperty":
            return StructProperty.read(ctx);
        case "ArrayProperty":
            return ArrayProperty.read(ctx);
        case "DoubleProperty":
        case "UInt64Property":
        case "ByteProperty":
        case "ObjectProperty":
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
        case "Int8Property":
        case "Int16Property":
        case "UInt8Property":
        case "UInt16Property":
        case "UInt32Property":
        default:
            return null;
    }
}

function isPropertyType(type: string) {
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

export function hexString(val: any) {
    return Buffer.from(val).toString('hex')
        .split('')
        .reduce((acc, curr, idx) => {
            if (idx % 2 === 0) {
                acc.push(curr)
            } else {
                acc[acc.length - 1] += curr;
            }
            return acc;
        }, [] as any[]).join(' ')
}