import { Link } from 'react-router-dom';

export const Footer = () => {
  return (
    <footer className="border-t border-border/20 py-8 bg-surface/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <Link to="/" className="inline-block">
              <h2 className="text-xl font-serif font-bold text-warm-ivory">
                COSMICARE
              </h2>
            </Link>
            <p className="text-sm text-muted-silver mt-2">
              Intelligent Care for the Final Frontier
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-silver justify-center">
            <Link to="/login" className="hover:text-warm-ivory transition-colors">
              Sign In
            </Link>
            <Link to="/register" className="hover:text-warm-ivory transition-colors">
              Get Started
            </Link>
            <Link to="/privacy" className="hover:text-warm-ivory transition-colors">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-warm-ivory transition-colors">
              Terms
            </Link>
            <Link to="/contact" className="hover:text-warm-ivory transition-colors">
              Contact
            </Link>
          </div>
        </div>
        <div className="mt-4 sm:mt-0 text-center text-xs text-muted-silver">
          © 2026 COSMICARE. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
