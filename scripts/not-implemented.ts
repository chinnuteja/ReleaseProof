const command = process.argv[2] ?? 'command';
process.stderr.write(`${command} is intentionally unavailable until its required phase is implemented; refusing a false success.\n`);
process.exitCode = 1;
