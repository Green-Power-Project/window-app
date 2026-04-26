'use client';

import Link from 'next/link';

export default function TermsAndConditionsPage() {
  return (
    <div className="flex flex-1 flex-col relative overflow-y-auto w-full">
      <div className="relative z-10 flex flex-1 flex-col w-full px-3 sm:px-4 pt-3 pb-3">
        <div className="w-full max-w-4xl mx-auto rounded-2xl border border-white/80 bg-white/80 backdrop-blur p-6 sm:p-8 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Terms &amp; Conditions</h1>
          <p className="text-sm text-gray-600">Last updated: April 26, 2026</p>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">1. Acceptance of terms</h2>
            <p className="text-sm text-gray-700">
              By accessing or using the Grün Power mobile application, website, and related services,
              you agree to be bound by these Terms &amp; Conditions and all applicable laws.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">2. Services</h2>
            <p className="text-sm text-gray-700">
              Grün Power provides project communication and document workflow services, including file
              uploads, signatures, comments, and related project collaboration features. Service
              availability may vary by project, region, and legal requirements.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">3. Account responsibilities</h2>
            <p className="text-sm text-gray-700">
              You are responsible for maintaining the confidentiality of your account credentials and for
              all activities under your account. You must provide accurate, current, and complete account
              and order information.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">4. Project documents and signatures</h2>
            <p className="text-sm text-gray-700">
              When you upload or sign project documents, you confirm that the submitted information and
              approvals are valid and lawful. We may use this information only for project documentation,
              verification, and fulfillment of contracted services.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">5. Project data, availability, and changes</h2>
            <p className="text-sm text-gray-700">
              Project data availability, folder structures, and features may change without prior notice.
              We reserve the right to limit or refuse actions in cases including misuse, invalid data, or
              legal restrictions.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">6. Prohibited use</h2>
            <p className="text-sm text-gray-700">
              You agree not to misuse the platform, upload unlawful or forged documents, interfere with
              service operations, attempt unauthorized access, or use the services for fraudulent or
              illegal purposes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">7. Intellectual property</h2>
            <p className="text-sm text-gray-700">
              All platform content, branding, software, and related materials are owned by or licensed to
              Grün Power and are protected by applicable intellectual property laws.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">8. Limitation of liability</h2>
            <p className="text-sm text-gray-700">
              Services are provided on an &quot;as available&quot; basis. To the extent permitted by law,
              Grün Power is not liable for indirect, incidental, special, or consequential damages
              arising from use of the app, website, or third-party service interruptions.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">9. Termination</h2>
            <p className="text-sm text-gray-700">
              We may suspend or terminate access in case of policy violations, misuse, or legal
              obligations. You may request account deletion as described on the Delete Account page.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">10. Changes to terms</h2>
            <p className="text-sm text-gray-700">
              We may revise these Terms &amp; Conditions from time to time. Continued use after updates
              means you accept the revised terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">11. Governing law and contact</h2>
            <p className="text-sm text-gray-700">
              These terms are governed by applicable laws in Germany. For legal or account-related queries,
              contact:
            </p>
            <p className="text-sm text-gray-700">
              Address: Waldseestraße 22, 88255 Baienfurt, Germany
            </p>
            <p className="text-sm text-gray-700">Phone: +49 157 317 096 86</p>
            <p className="text-sm text-gray-700">Email: info@gruen-power.de</p>
          </section>

          <div className="pt-4 border-t border-gray-100 text-sm text-gray-600 flex flex-wrap gap-3">
            <Link href="/privacy-policy" className="text-green-power-700 hover:underline">
              Privacy Policy
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

