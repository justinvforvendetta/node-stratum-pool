var util = require('./util.js');

/*
This function creates the generation transaction that accepts the reward for
successfully mining a new block.
For some (probably outdated and incorrect) documentation about whats kinda going on here,
see: https://en.bitcoin.it/wiki/Protocol_specification#tx
 */

var generateOutputTransactions = function(poolRecipient, recipients, rpcData) {
    var reward = rpcData.coinbasevalue;
    var rewardToPool = reward;

    var txOutputBuffers = [];

    for (var i = 0; i < recipients.length; i++) {
        var recipientReward = Math.floor(recipients[i].percent * reward);
        rewardToPool -= recipientReward;
        console.log(recipients)
        txOutputBuffers.push(
            Buffer.concat([
                util.packInt64LE(recipientReward),
                util.varIntBuffer(recipients[i].script.length),
                recipients[i].script,
            ])
        );
    }

    txOutputBuffers.unshift(
        Buffer.concat([
            util.packInt64LE(rewardToPool),
            util.varIntBuffer(poolRecipient.length),
            poolRecipient,
        ])
    );

    if (rpcData.default_witness_commitment !== undefined) {
        witness_commitment = new Buffer(
            rpcData.default_witness_commitment,
            'hex'
        );
        txOutputBuffers.unshift(
            Buffer.concat([
                util.packInt64LE(0),
                util.varIntBuffer(witness_commitment.length),
                witness_commitment,
            ])
        );
    }

    return Buffer.concat([
        util.varIntBuffer(txOutputBuffers.length),
        Buffer.concat(txOutputBuffers),
    ]);
};

exports.CreateGeneration = function(
    rpcData,
    publicKey,
    extraNoncePlaceholder,
    reward,
    txMessages,
    recipients
) {
    var txInputsCount = 1;
    var txVersion = 1;
    var txLockTime = 0;

    var txInPrevOutHash = '';
    var txInPrevOutIndex = 4294967295;
    var txInSequence = 0;

    //For coins that support/require transaction comments
    var scriptSigPart1 = Buffer.concat([
        util.serializeNumber(rpcData.height),
        new Buffer(rpcData.coinbaseaux.flags, 'hex'),
        util.serializeNumber((Date.now() / 1000) | 0),
        new Buffer([extraNoncePlaceholder.length]),
    ]);

    var scriptSigPart2 = util.serializeString('/nodeStratum/');

    var partOne = Buffer.concat([
        util.packInt32LE(txVersion),
        util.packUInt32LE(rpcData.curtime),

        //transaction input
        util.varIntBuffer(txInputsCount),
        util.uint256BufferFromHash(txInPrevOutHash),
        util.packUInt32LE(txInPrevOutIndex),
        util.varIntBuffer(
            scriptSigPart1.length +
                extraNoncePlaceholder.length +
                scriptSigPart2.length
        ),
        scriptSigPart1,
    ]);

    /*
    The generation transaction must be split at the extranonce (which located in the transaction input
    scriptSig). Miners send us unique extranonces that we use to join the two parts in attempt to create
    a valid share and/or block.
     */

    var outputTransactions = generateOutputTransactions(
        publicKey,
        recipients,
        rpcData
    );

    var partTwo = Buffer.concat([
        scriptSigPart2,
        util.packUInt32LE(txInSequence),
        //end transaction input

        //transaction output
        outputTransactions,
        //end transaction ouput

        util.packUInt32LE(txLockTime),
    ]);

    return [partOne, partTwo];
};
