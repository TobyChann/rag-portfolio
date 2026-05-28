export default function Footer() {
  return (
    <footer style={{
      borderTop: "1px solid var(--border)",
      padding: "20px 24px",
      textAlign: "center",
    }}>
      <p style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
        &copy; {new Date().getFullYear()} Chan Ngok Jung Toby. All rights reserved.
      </p>
    </footer>
  );
}