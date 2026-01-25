import { trace_generic_procedure } from "generic-handler/GenericProcedure";
import { gun_db_schema_encode } from "./encode";
import { gun_db_schema_decode } from "./decode";
import { gun_resolve } from "./gun_resolve";
import type { IGunInstance } from "gun";

// Browser-safe file logger - only creates file stream if in Node.js environment and tracing is enabled
let logStream: any = null;

const getFileLogger = () => {
    // Only create file logger in Node.js environment when tracing is enabled
    if (typeof window !== 'undefined' || process.env.ENABLE_TRACE !== 'true') {
        // Browser environment or tracing disabled - use console logger
        return (...args: any[]) => {
            const timestamp = new Date().toISOString();
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, (key, value) => 
                    typeof value === 'bigint' ? value.toString() : value
                , 2) : String(arg)
            ).join(' ');
            console.log(`[${timestamp}] ${message}`);
        };
    }

    // Node.js environment with tracing enabled - create file logger
    if (!logStream) {
        try {
            const fs = require('fs');
            const { join } = require('path');
            const logPath = process.env.TRACE_LOG_PATH || join(process.cwd(), 'trace.log');
            logStream = fs.createWriteStream(logPath, { flags: 'a' });
        } catch (error) {
            // If fs is not available, fall back to console
            console.warn('File logging not available, using console:', error);
            return (...args: any[]) => console.log(...args);
        }
    }

    return (...args: any[]) => {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value
            , 2) : String(arg)
        ).join(' ');
        logStream.write(`[${timestamp}] ${message}\n`);
    };
};

const fileLogger = getFileLogger();

// export const encode = (data: any) => trace_generic_procedure(console.log, gun_db_schema_encode, [data]);
export const encode = (data: any) => gun_db_schema_encode(data);

export const decode = async (data: any, gun: IGunInstance) => {
    // return gun_db_schema_decode(await gun_resolve(gun, data), gun);
    const resolved = await gun_resolve(gun, data);
    
    if (process.env.ENABLE_TRACE === 'true') {
        return trace_generic_procedure(fileLogger, gun_db_schema_decode, [resolved, gun]);
    }
    return gun_db_schema_decode(resolved, gun);
}
