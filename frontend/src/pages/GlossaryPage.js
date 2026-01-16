import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Search, Shield, AlertTriangle, Brain, Lock } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';

const GLOSSARY_DATA = [
    // Cialdini Principles
    {
        term: "Reciprocity",
        category: "Psychology",
        definition: "The human tendency to feel obliged to return a favor. Attackers exploit this by offering something 'free' (help, a file, a compliment) to create a debt.",
        example: "An attacker helps you solve a minor IT issue unprompted, then asks for your password to 'verify the fix'.",
        defense: "Recognize that the initial favor was likely a lure. Accept the help if genuine, but reject the obligation."
    },
    {
        term: "Scarcity",
        category: "Psychology",
        definition: "People value what is rare or dwindling. Attackers create artificial time pressure or limited availability to bypass critical thinking.",
        example: "\"Your account will be deleted in 24 hours\" or \"Only 2 spots left for the bonus claim.\"",
        defense: "Pause. Whenever you feel urgency, take a breath. Verify the claim through an official channel."
    },
    {
        term: "Authority",
        category: "Psychology",
        definition: "We are conditioned to obey authority figures. Attackers impersonate CEOs, Police, or IT Administrators to demand compliance.",
        example: "A deepfake voice call from the CEO demanding an immediate wire transfer.",
        defense: "Verify identity. Call the person back on a known internal number. Authority figures will respect security verification."
    },
    {
        term: "Consistency (Commitment)",
        category: "Psychology",
        definition: "Once we make a choice or take a stand, we encounter personal and interpersonal pressures to behave consistently with that commitment.",
        example: "Attacker asks for a small request first (answer a survey), then a larger one (download a file).",
        defense: "Recognize the 'Foot-in-the-Door' technique. It is okay to change your mind if the request escalates."
    },
    {
        term: "Liking",
        category: "Psychology",
        definition: "We prefer to say yes to people we like. Attackers use charm, similarity, and compliments to build rapport.",
        example: "An attacker researches your hobbies (e.g., golf) and strikes up a conversation about it before asking for sensitive data.",
        defense: "Separate the requester from the request. Like the person, but verify the policy."
    },
    {
        term: "Social Proof",
        category: "Psychology",
        definition: "We view a behavior as more correct in a given situation to the degree that we see others performing it.",
        example: "\"70% of your colleagues have already updated their password here.\"",
        defense: "Don't just follow the herd. Security is an individual responsibility."
    },

    // Attack Vectors
    {
        term: "Pretexting",
        category: "Attack Vector",
        definition: "The act of creating an invented scenario (the pretext) to engage a targeted victim in a manner that increases the chance the victim will divulge information.",
        example: "Posing as a fellow employee who forgot their badge.",
        defense: "Verify, Verify, Verify. Don't rely on the story provided by the requester."
    },
    {
        term: "Phishing",
        category: "Attack Vector",
        definition: "Sending fraudulent communications that appear to come from a reputable source, usually through email.",
        example: "An email looking like Microsoft 365 asking you to login again.",
        defense: "Check sender address, hover over links, and never enter credentials from an email link."
    },
    {
        term: "Spear Phishing",
        category: "Attack Vector",
        definition: "Targeted phishing where the attacker researches the victim to make the message highly personalized and convincing.",
        example: "Email referencing your recent project by name and your specific role.",
        defense: "Limit public information sharing on social media (OSINT)."
    },
    {
        term: "Vishing (Voice Phishing)",
        category: "Attack Vector",
        definition: "Phishing conducted by phone. Attackers often use voice modulation or deepfakes.",
        example: "A call from 'Bank Fraud Department' asking for your PIN.",
        defense: "Hang up and call the official number on the back of your card."
    },
    {
        term: "Baiting",
        category: "Attack Vector",
        definition: "Using a physical or digital lure to trap a victim.",
        example: "Leaving a USB drive labeled 'Executive Salaries' in the parking lot.",
        defense: "Never plug in unknown media. Curiosity killed the cat (and the network)."
    },
    {
        term: "Quid Pro Quo",
        category: "Attack Vector",
        definition: "Something for something. Attackers promise a benefit in exchange for information.",
        example: "Calling random extensions claiming to be IT Support and offering to 'fix the slow internet' if they give their password.",
        defense: "Legitimate IT support will never ask for your password."
    },

    // Technical Terms
    {
        term: "Deepfake",
        category: "Technology",
        definition: "Synthetic media in which a person in an existing image or video is replaced with someone else's likeness using AI.",
        example: "Fake audio of a CEO authorizing a transfer.",
        defense: "Look for unnatural blinking, audio glitches, or ask a challenge question only the real person would know."
    },
    {
        term: "OSINT",
        category: "Technology",
        definition: "Open Source Intelligence. Collecting data from publicly available sources to be used in an intelligence context.",
        example: "Scanning LinkedIn to build an org chart for targeting.",
        defense: "Minimize your digital footprint. Be aware of what you post."
    }
];

export default function GlossaryPage() {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState("All");

    const categories = ["All", ...new Set(GLOSSARY_DATA.map(item => item.category))];

    const filteredData = GLOSSARY_DATA.filter(item => {
        const matchesSearch = item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.definition.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="container mx-auto p-6 max-w-5xl animate-in fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-primary">
                    Security Glossary
                </h1>
                <p className="text-muted-foreground text-lg">
                    Compendium of Social Engineering Concepts & Defense Strategies
                </p>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search terms, definitions..."
                        className="pl-10 h-12 text-lg"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {categories.map(cat => (
                        <Button
                            key={cat}
                            variant={selectedCategory === cat ? "default" : "outline"}
                            onClick={() => setSelectedCategory(cat)}
                            className="whitespace-nowrap"
                        >
                            {cat}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredData.map((item, idx) => (
                    <Card key={idx} className="glass-panel overflow-hidden border transition-all hover:border-primary/50 hover:shadow-lg group">
                        <div className={`h-2 w-full ${item.category === 'Psychology' ? 'bg-purple-500' :
                            item.category === 'Attack Vector' ? 'bg-red-500' : 'bg-blue-500'
                            }`} />

                        <div className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl font-bold group-hover:text-primary transition-colors">{item.term}</h3>
                                <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                            </div>

                            <p className="text-muted-foreground mb-4 leading-relaxed">
                                {item.definition}
                            </p>

                            <div className="space-y-3 pt-4 border-t border-border/50">
                                <div className="flex items-start gap-3 text-sm">
                                    <AlertTriangle className="w-4 h-4 text-warning mt-1 shrink-0" />
                                    <div>
                                        <span className="font-bold text-warning">Example:</span>
                                        <span className="text-foreground/80 block">{item.example}</span>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 text-sm">
                                    <Shield className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                                    <div>
                                        <span className="font-bold text-green-500">Defense:</span>
                                        <span className="text-foreground/80 block">{item.defense}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {filteredData.length === 0 && (
                <div className="text-center py-20 opacity-50">
                    <Brain className="w-16 h-16 mx-auto mb-4" />
                    <p className="text-xl">No definitions found.</p>
                </div>
            )}
        </div>
    );
}

// Helper Button (imported but simplified for brevity in this file context, implies usage of standard shadcn button)
function Button({ children, variant = "default", className, ...props }) {
    const baseStyles = "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2";
    const variants = {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground"
    };
    return (
        <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
            {children}
        </button>
    );
}
