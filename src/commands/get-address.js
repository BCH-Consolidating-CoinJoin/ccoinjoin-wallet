/*
  oclif command to get a new recieve address.
*/

"use strict"

const fs = require("fs")
const BB = require("bitbox-sdk/lib/bitbox-sdk").default

const { Command, flags } = require("@oclif/command")

class GetAddress extends Command {
  async run() {
    try {
      const { flags } = this.parse(GetAddress)

      // Determine if this is a testnet wallet or a mainnet wallet.
      if (flags.testnet)
        var BITBOX = new BB({ restURL: "https://trest.bitcoin.com/v1/" })
      else var BITBOX = new BB({ restURL: "https://rest.bitcoin.com/v1/" })

      const newAddress = await this.getAddress(flags.name, BITBOX)

      // Display the address to the user.
      this.log(`${newAddress}`)
      //this.log(`legacy address: ${legacy}`)
    } catch (err) {
      if (err.message) console.log(err.message)
      else console.log(`Error in GetAddress.run: `, err)
    }
  }

  async getAddress(name, BITBOX) {
    // Exit if wallet not specified.
    if (!name || name === "")
      throw new Error(`You must specify a wallet with the -n flag.`)

    const walletInfo = this.openWallet(name)
    //console.log(`walletInfo: ${JSON.stringify(walletInfo, null, 2)}`)

    // root seed buffer
    const rootSeed = BITBOX.Mnemonic.toSeed(walletInfo.mnemonic)

    // master HDNode
    if (walletInfo.network === "testnet")
      var masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, "testnet")
    else var masterHDNode = BITBOX.HDNode.fromSeed(rootSeed)

    // HDNode of BIP44 account
    const account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")

    // derive an external change address HDNode
    const change = BITBOX.HDNode.derivePath(
      account,
      `0/${walletInfo.nextAddress}`
    )

    // Increment to point to a new address for next time.
    walletInfo.nextAddress++

    // Throw up a warning message when more than 100 addresses have been generated.
    if (walletInfo.nextAddress > 100) {
      console.log(`
        Over 100 addresses have been generated with this wallet. You should
        consider consolidating this wallet into a new one, to reduce processing
        time in tracking all the addresses.
      `)
    }

    // Update the wallet file.
    await this.saveWallet(name, walletInfo)

    // get the cash address
    const newAddress = BITBOX.HDNode.toCashAddress(change)
    const legacy = BITBOX.HDNode.toLegacyAddress(change)

    return newAddress
  }

  // Open a wallet by file name.
  openWallet(name) {
    try {
      const walletInfo = require(`../../wallets/${name}.json`)
      return walletInfo
    } catch (err) {
      throw new Error(`Could not open ${name}.json`)
    }
  }

  // Wrap the file save stuff in a Promise.
  saveWallet(name, walletData) {
    return new Promise((resolve, reject) => {
      fs.writeFile(
        `./wallets/${name}.json`,
        JSON.stringify(walletData, null, 2),
        function(err) {
          if (err) return reject(console.error(err))

          //console.log(`${name}.json written successfully.`)
          return resolve()
        }
      )
    })
  }
}

GetAddress.description = `Generate a new address to recieve BCH.`

GetAddress.flags = {
  name: flags.string({ char: "n", description: "Name of wallet" })
}

module.exports = GetAddress