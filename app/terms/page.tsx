import type { Metadata } from 'next';
import { contactLine, LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Terms of Use · Budget Analyser' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>By creating an account or using Budget Analyser you agree to these terms.</p>

      <h2>The service</h2>
      <p>
        Budget Analyser is a personal budgeting tool. It categorizes the transactions you provide and shows
        spending summaries, budget alerts and suggestions. It is provided as is, without warranties, and may
        change or be unavailable at times.
      </p>

      <h2>Not financial advice</h2>
      <p>
        Categories, totals and recommendations are automated and can be wrong. They are for your information
        only and are not financial, tax or legal advice. Check them against your statements before relying on
        them.
      </p>

      <h2>Your account and data</h2>
      <ul>
        <li>Keep your password private and use only your own financial data.</li>
        <li>You are responsible for the files you upload and the accounts you connect.</li>
        <li>You can delete your data and account at any time in the app (see the Privacy Policy).</li>
      </ul>

      <h2>Connected banks</h2>
      <p>
        Bank connections are provided through Plaid. By connecting an account you also agree to Plaid&apos;s terms
        and privacy policy. You can disconnect at any time from the Accounts page.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not attempt to access other users&apos; data, overload or disrupt the service, or use it for anything
        unlawful. We may suspend accounts that do.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for losses arising from use of the service or from
        errors in its categories, totals or suggestions.
      </p>

      <h2>Contact</h2>
      <p>Questions about these terms: {contactLine()}.</p>
    </LegalPage>
  );
}
