/*
  oclif command to update the balances stored in the wallet.json file.
*/

"use strict"

const BB = require("bitbox-sdk/lib/bitbox-sdk").default
const appUtil = require("../util")

// Used for debugging and error reporting.
const util = require("util")
util.inspect.defaultOptions = { depth: 2 }

const { Command, flags } = require("@oclif/command")

class UpdateBalances extends Command {
  async run() {
    try {
      const { flags } = this.parse(UpdateBalances)

      this.validateFlags(flags)

      const name = flags.name

      // Open the wallet data file.
      let walletInfo = appUtil.openWallet(name)
      walletInfo.name = name

      console.log(`Existing balance: ${walletInfo.balance} BCH`)

      // Determine if this is a testnet wallet or a mainnet wallet.
      if (walletInfo.network === "testnet")
        var BITBOX = new BB({ restURL: "https://trest.bitcoin.com/v1/" })
      else var BITBOX = new BB({ restURL: "https://rest.bitcoin.com/v1/" })

      // Update the balances in the wallet.
      walletInfo = await this.updateBalances(walletInfo, BITBOX)

      console.log(`Updated balance: ${walletInfo.balance} BCH`)
    } catch (err) {
      if (err.message) console.log(err.message)
      else console.log(`Error in UpdateBalances.run: `, err)
    }
  }

  // Validate the proper flags are passed in.
  validateFlags(flags) {
    // Exit if wallet not specified.
    const name = flags.name
    if (!name || name === "")
      throw new Error(`You must specify a wallet with the -n flag.`)

    return true
  }

  async updateBalances(walletInfo, BITBOX) {
    // Query data on each address that has been generated by the wallet.
    const addressData = await this.getAddressData(walletInfo, BITBOX)
    //console.log(`addressData: ${util.inspect(addressData)}`)

    // Update hasBalance array with non-zero balances.
    const hasBalance = this.generateHasBalance(addressData)

    // Sum all the balances in hasBalance to calculate total balance.
    const balance = this.sumConfirmedBalances(hasBalance)

    // Save the data to the wallet JSON file.
    walletInfo.balance = balance
    walletInfo.hasBalance = hasBalance
    await appUtil.saveWallet(walletInfo.name, walletInfo)

    return walletInfo
  }

  // Retrieves data (objects) on all addresses in an HD wallet and returns an
  // array of these objects.
  async getAddressData(walletInfo, BITBOX) {
    //const numberOfAddresses = walletInfo.nextAddress - 1
    const numberOfAddresses = walletInfo.nextAddress

    const balances = []
    for (var i = 0; i < numberOfAddresses; i++) {
      const thisAddress = this.generateAddress(walletInfo, i, BITBOX)

      // get BCH balance
      let balance = await BITBOX.Address.details([thisAddress])
      balance = balance[0]

      // Add the index to the object.
      balance.addressIndex = i

      balances.push(balance)
    }

    return balances
  }

  // Generates an HD address for the given index and wallet info.
  generateAddress(walletInfo, index, BITBOX) {
    // root seed buffer
    const rootSeed = BITBOX.Mnemonic.toSeed(walletInfo.mnemonic)

    // master HDNode
    if (walletInfo.network === "testnet")
      var masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, "testnet")
    else var masterHDNode = BITBOX.HDNode.fromSeed(rootSeed)

    // HDNode of BIP44 account
    const account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")

    // derive an external change address HDNode
    const change = BITBOX.HDNode.derivePath(account, `0/${index}`)

    // get the cash address
    const newAddress = BITBOX.HDNode.toCashAddress(change)
    //const legacy = BITBOX.HDNode.toLegacyAddress(change)

    return newAddress
  }

  // Generates the data that will be stored in the hasBalance array of the
  // wallet JSON file.
  generateHasBalance(addressData) {
    const hasBalance = []

    // Loop through each HD address index
    for (var i = 0; i < addressData.length; i++) {
      const thisAddr = addressData[i]

      // If the address has a balance, add it to the hasBalance array.
      if (thisAddr.balance > 0 || thisAddr.unconfirmedBalance > 0) {
        const thisObj = {
          index: i,
          balance: thisAddr.balance,
          balanceSat: thisAddr.balanceSat,
          unconfirmedBalance: thisAddr.unconfirmedBalance,
          unconfirmedBalanceSat: thisAddr.unconfirmedBalanceSat,
          cashAddress: thisAddr.cashAddress
        }

        hasBalance.push(thisObj)
      }
    }

    return hasBalance
  }

  // Sums the confirmed balances in the hasBalance array to create a single,
  // aggrigate balance.
  sumConfirmedBalances(hasBalance) {
    let total = 0
    for (var i = 0; i < hasBalance.length; i++) {
      const thisHasBalance = hasBalance[i]

      total += thisHasBalance.balance
    }

    // Convert to satoshis
    const totalSatoshis = Math.floor(total * 100000000)

    // Convert back to BCH
    total = totalSatoshis / 100000000

    return total
  }
}

UpdateBalances.description = `Poll the network and update the balances of the wallet.`

UpdateBalances.flags = {
  name: flags.string({ char: "n", description: "Name of wallet" })
}

module.exports = UpdateBalances
