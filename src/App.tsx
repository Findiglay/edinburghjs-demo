import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import * as web3 from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import "./App.css";

function App() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [keypair, setKeypair] = useState<web3.Keypair | null>(null);
  const [loading, setLoading] = useState(false);
  const [mint, setMint] = useState<string | null>(null);

  function generateKeypair() {
    // Generate a ed25519 keypair
    const keypair = web3.Keypair.generate();
    setKeypair(keypair);
  }

  async function createTokenMint() {
    console.log("called!");

    if (!wallet?.publicKey) {
      return toast("Please connect a wallet first", { type: "error" });
    }

    if (!keypair) {
      return toast("Please generate a keypair first", { type: "error" });
    }

    setLoading(true);

    try {
      const transaction = new web3.Transaction();

      // Get min rent exemption
      const lamports = await splToken.getMinimumBalanceForRentExemptMint(
        connection
      );

      // Create a new account for the mint
      transaction.add(
        web3.SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: keypair.publicKey,
          space: splToken.MINT_SIZE,
          programId: splToken.TOKEN_PROGRAM_ID,
          lamports,
        })
      );

      // Initialize the mint
      transaction.add(
        splToken.createInitializeMintInstruction(
          // Mint keypair
          keypair.publicKey,
          // Decimals
          0,
          // Authority
          wallet.publicKey,
          // Freeze Authority
          wallet.publicKey,
          // programId
          splToken.TOKEN_PROGRAM_ID
        )
      );

      // Set the fee payer i.e. me
      transaction.feePayer = wallet.publicKey;

      // Fetch the latest blockhash from the cluster
      // A transaction containing a blockhash that is too old (~2min as of this writing) is rejected by the network as invalid.
      transaction.recentBlockhash = await (
        await connection.getLatestBlockhash()
      ).blockhash;

      console.log(transaction);

      const txId = await wallet.sendTransaction(transaction, connection, {
        signers: [keypair],
      });

      await connection.confirmTransaction(txId, "confirmed");

      toast("Transaction confirmed!");

      setMint(keypair.publicKey.toBase58());
    } catch (error) {
      if (error instanceof Error) {
        toast(error.message, { type: "error" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function mintTo() {
    if (!wallet?.publicKey) {
      return toast("Please connect a wallet first", { type: "error" });
    }

    try {
      const mintAddress = new web3.PublicKey(mint as string);

      const [assosiatedTokenAddress] = await web3.PublicKey.findProgramAddress(
        [
          wallet.publicKey.toBuffer(),
          splToken.TOKEN_PROGRAM_ID.toBuffer(),
          mintAddress.toBuffer(),
        ],
        splToken.ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const transaction = new web3.Transaction({
        feePayer: wallet.publicKey,
      });

      transaction.add(
        splToken.createAssociatedTokenAccountInstruction(
          // payer
          wallet.publicKey,
          // associated token
          assosiatedTokenAddress,
          // owner
          wallet.publicKey,
          // mint
          mintAddress,
          splToken.TOKEN_PROGRAM_ID,
          splToken.ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

      // Mint some tokens to my own wallet
      transaction.add(
        splToken.createMintToInstruction(
          // mint,
          mintAddress,
          // destination
          assosiatedTokenAddress,
          // authority
          wallet.publicKey,
          // amount to mint
          1_000_000,
          // multiSigners
          [],
          splToken.TOKEN_PROGRAM_ID
        )
      );

      // Set mint authority to none, so that supply becomes fixed
      transaction.add(
        splToken.createSetAuthorityInstruction(
          // mint
          mintAddress,
          // currentAuthority
          wallet.publicKey,
          // authorityType
          0,
          // newAuthority
          null
        )
      );

      transaction.recentBlockhash = await (
        await connection.getLatestBlockhash()
      ).blockhash;

      const txId = await wallet.sendTransaction(transaction, connection);

      await connection.confirmTransaction(txId, "confirmed");

      toast("Transaction confirmed!");
    } catch (error) {
      if (error instanceof Error) {
        toast(error.message, { type: "error" });
      }
    }
  }

  function copyToClipboard(e: React.MouseEvent<HTMLInputElement>) {
    navigator.clipboard.writeText(e.currentTarget.value);
  }

  return (
    <>
      <div className="App">
        <h1>Edinburgh JS Demo</h1>

        <input
          readOnly
          value={keypair?.publicKey.toBase58() || ""}
          onClick={copyToClipboard}
        />
        <button onClick={generateKeypair}>Generate Keypair</button>

        {mint ? (
          <button onClick={mintTo}>Mint to my wallet</button>
        ) : (
          <button onClick={createTokenMint} disabled={loading}>
            Generate Token Mint
          </button>
        )}
        <WalletMultiButton />

        {mint && (
          <a
            href={`https://explorer.solana.com/address/${mint}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            View Mint on Explorer
          </a>
        )}
      </div>
      <ToastContainer />
    </>
  );
}

export default App;
