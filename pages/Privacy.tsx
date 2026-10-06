
import React from 'react';

const Privacy: React.FC = () => {
  return (
    <div className="min-h-screen bg-white font-inter pt-32 pb-20">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-20">
          <h2 className="text-xs font-black text-indigo-600 uppercase tracking-[0.3em] mb-4">Legal</h2>
          <h1 className="text-5xl lg:text-7xl font-black text-slate-900 tracking-tight mb-8 leading-none">Privacy Policy.</h1>
          <p className="text-xl text-slate-500 font-medium leading-relaxed">
            Your privacy is important to us. It is Agently's policy to respect your privacy regarding any information we may collect from you across our website.
          </p>
        </div>

        <div className="prose prose-slate max-w-none prose-headings:font-black prose-headings:tracking-tight prose-p:text-slate-500 prose-p:font-medium prose-p:leading-relaxed">
          <section className="mb-12">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tight">1. Information We Collect</h2>
            <p>We only ask for personal information when we truly need it to provide a service to you. We collect it by fair and lawful means, with your knowledge and consent. We also let you know why we’re collecting it and how it will be used.</p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tight">2. Use of Information</h2>
            <p>We use your personal information to provide and improve our services, to communicate with you, and to comply with legal obligations. We may also use your information to personalize your experience and to send you promotional communications.</p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tight">3. Data Retention</h2>
            <p>We only retain collected information for as long as necessary to provide you with your requested service. What data we store, we’ll protect within commercially acceptable means to prevent loss and theft, as well as unauthorized access, disclosure, copying, use or modification.</p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tight">4. Third-Party Sharing</h2>
            <p>We don’t share any personally identifying information publicly or with third-parties, except when required to by law.</p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tight">5. Cookies</h2>
            <p>Our website uses cookies to enhance your experience. You can choose to disable cookies in your browser settings, but this may affect the functionality of our website.</p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tight">6. Your Rights</h2>
            <p>You have the right to access, correct, or delete your personal information. You can also object to the processing of your information and request that we restrict the processing of your information.</p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tight">7. Calendar Integrations</h2>
            <p>
              If you connect your Google Calendar or Calendly account in Settings &rarr; Integrations, Agently accesses that
              account solely to book and manage appointments during phone calls handled by your AI voice agents. Connecting is
              optional, and Agently never accesses a calendar you have not explicitly connected.
            </p>
            <p className="mt-6"><strong className="text-slate-900">What we access from Google, and why:</strong></p>
            <ul className="mt-4 space-y-3">
              <li>
                <strong className="text-slate-900">Free/busy information</strong> (<code>calendar.freebusy</code>) &mdash; to check which
                time slots are open before the agent offers them to a caller. We do not read the titles, attendees or details of
                your existing events for this purpose, only whether a time range is free or busy.
              </li>
              <li>
                <strong className="text-slate-900">Calendar events</strong> (<code>calendar.events</code>) &mdash; to create an event when a
                caller books, and to cancel it if the booking is cancelled. Agently only creates, updates or deletes events it
                created itself, or that are directly tied to a booking made through Agently. It does not modify your other events.
              </li>
              <li>
                <strong className="text-slate-900">Basic profile</strong> (<code>openid</code>, <code>email</code>, <code>profile</code>) &mdash; to
                show which Google account is connected, so you can confirm the right calendar is linked.
              </li>
              <li>
                <strong className="text-slate-900">Your list of calendars</strong> (<code>calendar.calendarlist.readonly</code>) &mdash; to
                show which calendars the account has, so you can choose which one the agent books into. This is the
                names of your calendars, not what is in them.
              </li>
            </ul>
            <p className="mt-6">
              <strong className="text-slate-900">From Calendly</strong>, we request only what booking requires: reading your user
              profile, event types and availability, creating and cancelling scheduled events, and subscribing to webhooks so we
              learn about changes made outside Agently.
            </p>
            <p className="mt-6">
              Agently's use of information received from Google APIs adheres to the{' '}
              <a
                className="text-indigo-600 underline"
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. We do not use calendar data for advertising, we do not sell it, and we do
              not allow humans to read it except where required for security, to comply with the law, or with your explicit consent.
            </p>
            <p className="mt-6">
              <strong className="text-slate-900">What we store.</strong> Your calendar credentials are encrypted at rest with
              AES-256-GCM and are bound to your organisation, so a stored credential cannot be read in another tenant's context. For
              each appointment booked through Agently we also store the booking details supplied by the caller &mdash; typically a
              name, email address and phone number &mdash; together with the appointment time, so the booking can be shown to you,
              reconciled with your calendar and cancelled if needed.
            </p>
            <p className="mt-6">
              <strong className="text-slate-900">Disconnecting.</strong> You can disconnect at any time in Settings &rarr;
              Integrations. Doing so revokes Agently's access at the provider and deletes the stored credentials. You can also revoke
              access directly at{' '}
              <a
                className="text-indigo-600 underline"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
              >
                myaccount.google.com/permissions
              </a>{' '}
              for Google, or in your Calendly account settings.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tight">8. Contact Us</h2>
            <p>If you have any questions about our Privacy Policy, please contact us at agentlycallsupport@gmail.com.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
