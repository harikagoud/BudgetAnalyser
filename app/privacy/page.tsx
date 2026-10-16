import type { Metadata } from 'next';
import { contactLine, LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy · Budget Analyser' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Budget Analyser helps you see where your money goes by categorizing transactions from statements
        you upload or from bank accounts you choose to connect. This page explains what we collect, why,
        and how you can remove it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your email address and a salted hash of your password (we never store the password itself).</li>
        <li>
          Transactions: date, amount and merchant description, from statements you upload or from accounts
          you connect, plus the categories, budget limits and settings you choose.
        </li>
        <li>
          If you connect a bank through Plaid: the institution name, account names and the last four digits
          of account numbers, and an access token that lets us fetch transactions. The token is stored
          encrypted. We never see or store your bank login or password; you enter them directly with Plaid
          or your bank.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Only to run the app for you: show your spending, compare months, check budget limits, suggest ways to
        save, and send the email that verifies your address. We do not sell your data, use it for
        advertising, or share it with anyone other than the service providers below.
      </p>

      <h2>Service providers</h2>
      <ul>
        <li>Vercel, which hosts the application.</li>
        <li>Neon, which hosts the database.</li>
        <li>Google (Gmail SMTP), which delivers verification emails.</li>
        <li>Plaid, only if you connect a bank. Plaid&apos;s own privacy policy applies to its part of the process.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Connections use HTTPS, passwords are hashed, bank access tokens are encrypted at rest, and every query
        is limited to the signed-in user&apos;s own data. No system is perfectly secure, so please use a unique
        password.
      </p>

      <h2>Keeping and deleting your data</h2>
      <p>
        We keep your data until you delete it. You can delete an uploaded statement or account from the
        Accounts page, disconnect a bank (which revokes our access at Plaid), or delete your whole account
        in Settings, which removes your transactions, settings and rules and revokes every bank connection.
        Copies may remain in the database provider&apos;s backups for a short time before they expire.
      </p>

      <h2>Contact</h2>
      <p>Questions or requests about your data: {contactLine()}.</p>
    </LegalPage>
  );
}
