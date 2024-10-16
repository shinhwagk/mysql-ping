import { spawn } from 'child_process';

interface RunMySQLCommandCallback {
    (error: Error | null, result: string | null): void;
}

/**
 * Function to run MySQL command with password input.
 * 
 * @param {string} user - MySQL username.
 * @param {string} password - MySQL password.
 * @param {string} command - MySQL command to be executed.
 * @param {RunMySQLCommandCallback} callback - Callback function to handle output or errors.
 */
function runMySQLCommand(host: string, port: string, user: string, password: string, command: string, callback: RunMySQLCommandCallback): void {
    // Spawn the MySQL process with the provided user and the -p flag for password
    const mysqlProcess = spawn('mysql', ['-h', host, '-P', port, '-u', user, '-p', '-e', command], { stdio: 'pipe' });

    // Pass the password when prompted
    mysqlProcess.stdin.write(`${password}\n`);
    mysqlProcess.stdin.end();

    // Collect output from stdout
    let output = '';
    mysqlProcess.stdout.on('data', (data: Buffer) => {
        output += data.toString();
    });

    // Collect error from stderr
    let errorOutput = '';
    mysqlProcess.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
    });

    // Handle process close event
    mysqlProcess.on('close', (code: number) => {
        if (code === 0) {
            callback(null, output);  // No errors, return output
        } else {
            callback(new Error(`Process exited with code ${code}: ${errorOutput}`), null);
        }
    });
}

// Example usage:
const host = '192.168.161.93'
const port = "33226"
const user = 'root';
const password = 'YourPasswordHere';
const command = 'SHOW DATABASES;';

runMySQLCommand(host, port, user, password, command, (error, result) => {
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Result:', result);
    }
});
