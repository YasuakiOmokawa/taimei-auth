export const PhishingBanner = () => {
  return (
    <div
      className="sticky top-0 z-50 border-b border-yellow-300 bg-yellow-100 px-4 py-2 text-sm font-medium text-yellow-900"
      role="alert"
    >
      [セキュリティ] このログインページは <strong>https://auth.taimei-code.com</strong> です。URL
      を必ず確認してください。
    </div>
  );
};
