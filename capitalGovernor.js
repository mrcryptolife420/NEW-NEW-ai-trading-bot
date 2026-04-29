// Enabling paper probe entries in recovery mode with improved logging for blocked trades

const enableProbeEntries = (recoveryMode) => {
    console.log(`Recovery Status: ${recoveryMode ? 'Enabled' : 'Disabled'}`);
    const allowProbeEntries = recoveryMode;
    console.log(`Allow Probe Entries: ${allowProbeEntries}`);

    if (!allowProbeEntries) {
        console.log('Probe entries are not allowed due to recovery mode being off.');
        return;
    }

    // Logic for handling probe entries
    // ...
};

const logBlockedTradeReasons = (trade, reasons) => {
    if (reasons.length > 0) {
        console.log(`Blocked Trade: ${trade.id}`);
        reasons.forEach(reason => {
            console.log(`Blocker Reason: ${reason}`);
        });
    } else {
        console.log(`Trade ${trade.id} is allowed to proceed.`);
    }
};

// Example usage
const trade = { id: 12345 };
const reasons = ['Price too high', 'Risk threshold exceeded'];

enableProbeEntries(true);
logBlockedTradeReasons(trade, reasons);