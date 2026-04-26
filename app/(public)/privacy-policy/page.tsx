'use client';

import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-1 flex-col relative overflow-y-auto w-full">
      <div className="relative z-10 flex flex-1 flex-col w-full px-3 sm:px-4 pt-3 pb-3">
        <div className="w-full max-w-4xl mx-auto rounded-2xl border border-white/80 bg-white/80 backdrop-blur p-6 sm:p-8 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-sm text-gray-600">Last updated: April 26, 2026</p>

          <p className="text-sm text-gray-700">
            Grün Power (&apos;we&apos;, &apos;us&apos;, or &apos;our&apos;) operates this mobile
            application, website, and related services. This Privacy Policy describes how we collect,
            use, and protect your personal and project-related information when you use our app or
            services.
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">1. Information we collect</h2>
            <p className="text-sm text-gray-700">
              Account &amp; profile: email used to create and sign in to your account, and profile
              details you provide (such as display name/phone), where applicable.
            </p>
            <p className="text-sm text-gray-700">
              Contact &amp; project data: name, phone number, email (if provided), project references,
              folder information, and communication details when you use project services, request support,
              or communicate with our team.
            </p>
            <p className="text-sm text-gray-700">
              Document Data (project file/signature information): when you upload or review project
              documents, reports, delivery notes, offers, or change orders, you may provide file content,
              comments, and signature-related details (for example signatory name, role, place, and time).
              We collect, store, and use this data to process project workflows and document approvals.
            </p>
            <p className="text-sm text-gray-700">
              Technical data: browser type, device information, and general usage data (e.g. pages
              visited) to improve our app and website. We may use cookies or similar technologies as
              described below.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">2. How we use your information</h2>
            <p className="text-sm text-gray-700">
              We use the information above to manage customer accounts, process and maintain project
              files, support document signing workflows, communicate about project updates, respond to
              enquiries, comply with legal obligations, and improve our app and website experience. For
              Document Data collected from uploaded project files and signatures, we use it only to process
              and fulfill project documentation workflows. We do not sell your personal data.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">3. Sharing of information</h2>
            <p className="text-sm text-gray-700">
              We may share limited information with trusted partners only as needed to operate our
              services-for example, IT providers, hosting providers, communication providers, or
              subcontractors under confidentiality obligations. We may also disclose information if required
              by law or to protect our rights and safety. We may share project document data only with
              authorized personnel and partners as needed to process and fulfill project requirements.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">4. Data retention &amp; security</h2>
            <p className="text-sm text-gray-700">
              We retain information only as long as necessary for the purposes described, unless a longer
              period is required by law. Project documents and related signature data may be retained as
              needed to provide services, handle support, maintain audit history, and comply with legal
              requirements. We implement reasonable technical and organisational measures to protect your
              data; however, no online transmission is 100% secure.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">5. Cookies</h2>
            <p className="text-sm text-gray-700">
              Our site may use cookies or local storage to remember preferences, measure traffic, or
              improve performance. You can adjust your browser settings to limit cookies; some features
              may not work as intended if you do.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">6. Your rights</h2>
            <p className="text-sm text-gray-700">
              Depending on applicable law, you may have the right to access, correct, or delete certain
              personal data, or to object to or restrict certain processing. To exercise these rights or
              ask questions, contact us using the details below. Users can request deletion of their
              personal and project-related data by contacting us at info@gruen-power.de. We will process
              such requests within a reasonable timeframe in accordance with applicable laws.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">7. Children</h2>
            <p className="text-sm text-gray-700">
              Our services are not directed at children under 13. We do not knowingly collect personal
              information from children.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">8. Changes to this policy</h2>
            <p className="text-sm text-gray-700">
              We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at the top
              will change when we do. Continued use of the site after changes means you accept the
              updated policy.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">9. Contact us</h2>
            <p className="text-sm text-gray-700">For privacy-related questions or requests, contact us:</p>
            <p className="text-sm text-gray-700">
              Address: Waldseestraße 22, 88255 Baienfurt, Germany
            </p>
            <p className="text-sm text-gray-700">Phone: +49 157 317 096 86</p>
            <p className="text-sm text-gray-700">Email: info@gruen-power.de</p>
            <p className="text-sm text-gray-700">See also our Terms &amp; Conditions.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">10. App Permissions</h2>
            <p className="text-sm text-gray-700">
              Our mobile application may request the following permissions:
            </p>
            <p className="text-sm text-gray-700">
              Camera / Storage: To upload project documents, images, and signature-related files.
            </p>
            <p className="text-sm text-gray-700">
              Internet Access: To communicate with our servers and provide app functionality.
            </p>
            <p className="text-sm text-gray-700">
              These permissions are used strictly for app functionality and not for any unrelated
              purposes.
            </p>
          </section>

          <div className="pt-4 border-t border-gray-100 text-sm text-gray-600 flex flex-wrap gap-3">
            <Link href="/terms-and-conditions" className="text-green-power-700 hover:underline">
              Terms &amp; Conditions
            </Link>
            <span aria-hidden>-</span>
            <Link href="/delete-account" className="text-green-power-700 hover:underline">
              Delete Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

